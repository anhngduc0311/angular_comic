using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using MangaFlux.API.Data;
using MangaFlux.API.Middleware;
using MangaFlux.API.Models;
using MangaFlux.API.Services;
using MangaFlux.API.Services.HealthChecks;
using Prometheus;

var builder = WebApplication.CreateBuilder(args);

// 1. Add DbContext with SQL Server
builder.Services.AddDbContext<MangaDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// 2. Register Application Services, Distributed Caching & Exception Handling
var redisConnectionString = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrEmpty(redisConnectionString))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnectionString;
        options.InstanceName = "MangaFlux_";
    });

    try
    {
        var muxer = StackExchange.Redis.ConnectionMultiplexer.Connect(redisConnectionString);
        builder.Services.AddSingleton<StackExchange.Redis.IConnectionMultiplexer>(muxer);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Redis connection notice: {ex.Message}");
    }
}
else
{
    builder.Services.AddDistributedMemoryCache();
}

builder.Services.AddScoped<ICacheService, CacheService>();
builder.Services.AddHostedService<ViewSyncWorker>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

// 2a. Register Health Checks
builder.Services.AddHealthChecks()
    .AddCheck<SqlServerHealthCheck>("database", tags: new[] { "ready", "db" })
    .AddCheck<RedisHealthCheck>("redis", tags: new[] { "ready", "cache" })
    .AddCheck<StorageHealthCheck>("storage", tags: new[] { "ready", "storage" });

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IComicService, ComicService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<IStorageService, MinioStorageService>();
builder.Services.AddScoped<ISearchEngineService, SearchEngineService>();

// 2b. Add Rate Limiting Policies for Anti-Spam & Anti-BruteForce
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsync(
            "{\"message\":\"Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau 1 phút.\"}", token);
    };

    // Policy 1: Auth (Login/Register/Refresh) - 5 requests / min
    options.AddFixedWindowLimiter("auth-limiter", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });

    // Policy 2: Comment (Add/Like) - 10 requests / min
    options.AddFixedWindowLimiter("comment-limiter", opt =>
    {
        opt.PermitLimit = 10;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });

    // Policy 3: Report - 5 requests / min
    options.AddFixedWindowLimiter("report-limiter", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });

    // Policy 4: Chapter Reader (Anti-Scraper) - 60 requests / min (Sliding Window)
    options.AddSlidingWindowLimiter("chapter-limiter", opt =>
    {
        opt.PermitLimit = 60;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.SegmentsPerWindow = 6;
        opt.QueueLimit = 0;
    });
});

// 3. Configure CORS (Allow Angular Frontend)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// 4. Configure JWT Authentication
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secret = jwtSettings["Secret"] 
             ?? Environment.GetEnvironmentVariable("JWT_SECRET") 
             ?? throw new InvalidOperationException("JwtSettings:Secret configuration is missing!");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
        ValidateIssuer = true,
        ValidIssuer = jwtSettings["Issuer"] ?? "MangaFluxAPI",
        ValidateAudience = true,
        ValidAudience = jwtSettings["Audience"] ?? "MangaFluxClient",
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "MangaFlux Web API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// Global Exception Handling Middleware
app.UseExceptionHandler();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "MangaFlux API v1"));
}

app.UseCors("AllowAngularApp");
app.UseMiddleware<AntiScraperMiddleware>();
app.UseRateLimiter();
app.UseMiddleware<ImageCacheMiddleware>();

// Auto EF Core Database Migration / Schema sync
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
    try
    {
        db.Database.Migrate();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"DB Migration notice: {ex.Message}");
    }

    try
    {
        db.Database.ExecuteSqlRaw(@"
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'RefreshToken')
            BEGIN
                ALTER TABLE [Users] ADD [RefreshToken] NVARCHAR(MAX) NULL;
            END;

            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'RefreshTokenExpiryTime')
            BEGIN
                ALTER TABLE [Users] ADD [RefreshTokenExpiryTime] DATETIME2 NULL;
            END;

            DELETE FROM ChapterPages WHERE ChapterId IN (
                SELECT Id FROM (
                    SELECT Id, ComicId, ChapterNumber,
                           ROW_NUMBER() OVER(PARTITION BY ComicId, ChapterNumber ORDER BY Id DESC) as rn
                    FROM Chapters
                ) t WHERE t.rn > 1
            );

            DELETE FROM Chapters WHERE Id IN (
                SELECT Id FROM (
                    SELECT Id, ComicId, ChapterNumber,
                           ROW_NUMBER() OVER(PARTITION BY ComicId, ChapterNumber ORDER BY Id DESC) as rn
                    FROM Chapters
                ) t WHERE t.rn > 1
            );
        ");

        var adminUser = db.Users.FirstOrDefault(u => u.Username == "admin");
        if (adminUser == null)
        {
            db.Users.Add(new User
            {
                Username = "admin",
                Email = "admin@mangaflux.com",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"),
                FullName = "Quản Trị Viên",
                Role = "Admin",
                CreatedAt = DateTime.UtcNow
            });
            db.SaveChanges();
        }
        else if (adminUser.Role != "Admin")
        {
            adminUser.Role = "Admin";
            adminUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123");
            db.SaveChanges();
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"DB Column / Admin Sync notice: {ex.Message}");
    }
}

app.UseAuthentication();
app.UseAuthorization();

// 5. Prometheus HTTP Request Metrics & Endpoint
app.UseHttpMetrics();
app.MapMetrics("/metrics");

// 6. ASP.NET Core Health Check Endpoints
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var response = new
        {
            status = report.Status.ToString(),
            totalDurationMs = Math.Round(report.TotalDuration.TotalMilliseconds, 2),
            timestamp = DateTime.UtcNow,
            entries = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                description = e.Value.Description,
                durationMs = Math.Round(e.Value.Duration.TotalMilliseconds, 2),
                exception = e.Value.Exception?.Message
            })
        };
        await context.Response.WriteAsync(JsonSerializer.Serialize(response, new JsonSerializerOptions { WriteIndented = true }));
    }
});

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});

app.MapControllers();

app.Run();
