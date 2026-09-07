using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using TruyenKomi.API.Data;
using TruyenKomi.API.Middleware;
using TruyenKomi.API.Models;
using TruyenKomi.API.Services;
using TruyenKomi.API.Services.HealthChecks;
using TruyenKomi.API.Validators;
using FluentValidation;
using FluentValidation.AspNetCore;
using Prometheus;

// 0. Auto-load .env file if present in current or parent directories
var currentDir = Directory.GetCurrentDirectory();
var envCandidates = new[]
{
    Path.Combine(currentDir, ".env"),
    Path.Combine(currentDir, "..", ".env"),
    Path.Combine(currentDir, "..", "..", ".env")
};

foreach (var envPath in envCandidates)
{
    if (File.Exists(envPath))
    {
        foreach (var line in File.ReadAllLines(envPath))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#")) continue;
            var parts = trimmed.Split('=', 2);
            if (parts.Length == 2)
            {
                var key = parts[0].Trim();
                var val = parts[1].Trim().Trim('"', '\'');
                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                {
                    Environment.SetEnvironmentVariable(key, val);
                }
            }
        }
        break;
    }
}

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxRequestBodySize = 300 * 1024 * 1024; // 300MB
});

builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.ValueLengthLimit = int.MaxValue;
    options.MultipartBodyLengthLimit = 300 * 1024 * 1024; // 300MB
    options.MemoryBufferThreshold = 10 * 1024 * 1024;
});

// 1. Add DbContext with PostgreSQL
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
var defaultConn = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING") 
                  ?? builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<MangaDbContext>(options =>
    options.UseNpgsql(defaultConn, npgsqlOptions =>
        npgsqlOptions.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery)));

// 2. Register Application Services, Distributed Caching & Exception Handling
var redisConnectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING") 
                            ?? builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrEmpty(redisConnectionString))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnectionString;
        options.InstanceName = "TruyenKomi_";
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
    .AddCheck<PostgreSqlHealthCheck>("database", tags: new[] { "ready", "db" })
    .AddCheck<RedisHealthCheck>("redis", tags: new[] { "ready", "cache" })
    .AddCheck<StorageHealthCheck>("storage", tags: new[] { "ready", "storage" });

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IComicService, ComicService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IReportService, ReportService>();
builder.Services.AddScoped<IStorageService, MinioStorageService>();
builder.Services.AddScoped<ISearchEngineService, SearchEngineService>();

// 2b. Register FluentValidation
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<RegisterDtoValidator>();

// 2c. Add Rate Limiting Policies for Anti-Spam & Anti-BruteForce
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsync(
            "{\"message\":\"Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau 1 phút.\"}", token);
    };

    // Policy 1: Auth (Login/Register) - 60 requests / min
    options.AddFixedWindowLimiter("auth-limiter", opt =>
    {
        opt.PermitLimit = 60;
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
        ValidIssuer = jwtSettings["Issuer"] ?? "TruyenKomiAPI",
        ValidateAudience = true,
        ValidAudience = jwtSettings["Audience"] ?? "TruyenKomiClient",
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "TruyenKomi Web API", Version = "v1" });
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

// Enable Swagger for API documentation & testing
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "TruyenKomi API v1"));

app.UseCors("AllowAngularApp");
app.UseMiddleware<AntiScraperMiddleware>();
app.UseRateLimiter();
app.UseMiddleware<ImageCacheMiddleware>();

// Auto Database Creation and Schema Sync with Connection Retry
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
    var connected = false;
    for (int retry = 1; retry <= 12; retry++)
    {
        try
        {
            if (db.Database.CanConnect())
            {
                connected = true;
                break;
            }
        }
        catch { }
        Console.WriteLine($"[PostgreSQL] Waiting for database to be ready (attempt {retry}/12)...");
        System.Threading.Thread.Sleep(3000);
    }

    if (connected)
    {
        try
        {
            if (db.Database.IsRelational())
            {
                try
                {
                    db.Database.ExecuteSqlRaw(@"
                        CREATE TABLE IF NOT EXISTS ""__EFMigrationsHistory"" (
                            ""MigrationId"" character varying(150) NOT NULL,
                            ""ProductVersion"" character varying(32) NOT NULL,
                            CONSTRAINT ""PK___EFMigrationsHistory"" PRIMARY KEY (""MigrationId"")
                        );
                        DO $$
                        BEGIN
                            IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Categories') THEN
                                INSERT INTO ""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
                                VALUES ('20260907013224_Initial_Postgres_Schema', '9.0.4')
                                ON CONFLICT (""MigrationId"") DO NOTHING;
                            END IF;
                        END $$;
                    ");
                }
                catch { }

                db.Database.Migrate();
                Console.WriteLine("[EF Core] Migrations applied successfully.");
            }
            else
            {
                db.Database.EnsureCreated();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EF Core] Migration notice: {ex.Message}");
            try
            {
                db.Database.EnsureCreated();
            }
            catch { }
        }

        try
        {
            var adminUser = db.Users.FirstOrDefault(u => u.Username == "admin" || u.Email == "admin@truyenkomi.com");
            if (adminUser == null)
            {
                db.Users.Add(new User
                {
                    Username = "admin",
                    Email = "admin@truyenkomi.com",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123"),
                    FullName = "Quản Trị Viên",
                    Role = "Admin",
                    IsLocked = false,
                    CreatedAt = DateTime.UtcNow
                });
                db.SaveChanges();
                Console.WriteLine("Admin user 'admin' created with password 'admin123'.");
            }
            else
            {
                adminUser.Username = "admin";
                adminUser.Email = "admin@truyenkomi.com";
                adminUser.Role = "Admin";
                adminUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword("admin123");
                adminUser.IsLocked = false;
                db.SaveChanges();
                Console.WriteLine("Admin user 'admin' password synced to 'admin123'.");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Admin Seed notice: {ex.Message}");
        }
    }
    else
    {
        Console.WriteLine("[PostgreSQL] Could not connect to database after 12 retries.");
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
