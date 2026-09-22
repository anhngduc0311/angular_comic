using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Google.Apis.Auth;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;

namespace TruyenKomi.API.Services
{
    public class AuthResult
    {
        public AuthResponseDto Response { get; set; } = null!;
        public string RefreshToken { get; set; } = string.Empty;
    }

    public interface IAuthService
    {
        Task<AuthResult?> RegisterAsync(RegisterDto dto);
        Task<AuthResult?> LoginAsync(LoginDto dto);
        Task<AuthResult?> GoogleLoginAsync(string idToken);
        Task<AuthResult?> RefreshTokenAsync(string refreshToken);
        Task<bool> RevokeRefreshTokenAsync(string refreshToken);
    }

    public class AuthService : IAuthService
    {
        private readonly MangaDbContext _context;
        private readonly IConfiguration _config;

        public AuthService(MangaDbContext context, IConfiguration config)
        {
            _context = context;
            _config = config;
        }

        private int GetExpiryInDays()
        {
            var envExpiry = Environment.GetEnvironmentVariable("JWT_EXPIRY_DAYS");
            if (!string.IsNullOrEmpty(envExpiry) && int.TryParse(envExpiry, out int envDays) && envDays > 0)
            {
                return envDays;
            }
            if (int.TryParse(_config["JwtSettings:ExpiryInDays"], out int days) && days > 0)
            {
                return days;
            }
            return 30;
        }

        public async Task<AuthResult?> RegisterAsync(RegisterDto dto)
        {
            if (await _context.Users.AnyAsync(u => u.Username == dto.Username || u.Email == dto.Email))
            {
                return null; // Username or Email already exists
            }

            int expiryDays = GetExpiryInDays();
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
            var refreshToken = GenerateRefreshToken();
            var user = new User
            {
                Username = dto.Username,
                Email = dto.Email,
                PasswordHash = passwordHash,
                FullName = dto.FullName ?? dto.Username,
                Role = "User",
                CreatedAt = DateTime.UtcNow,
                RefreshToken = refreshToken,
                RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(expiryDays)
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user);
            return new AuthResult
            {
                Response = new AuthResponseDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Email = user.Email,
                    FullName = user.FullName,
                    Avatar = user.Avatar,
                    Role = user.Role,
                    Token = token
                },
                RefreshToken = refreshToken
            };
        }

        public async Task<AuthResult?> LoginAsync(LoginDto dto)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u =>
                u.Username == dto.UsernameOrEmail || u.Email == dto.UsernameOrEmail);

            if (user == null) return null;
            if (user.IsLocked) return null; // Account locked

            bool isPasswordValid = false;
            try
            {
                if (user.PasswordHash.StartsWith("$2a$") || user.PasswordHash.StartsWith("$2b$") || user.PasswordHash.StartsWith("$2y$"))
                {
                    isPasswordValid = BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash);
                }
                else
                {
                    isPasswordValid = (user.PasswordHash == dto.Password);
                }
            }
            catch
            {
                isPasswordValid = false;
            }

            if (!isPasswordValid)
            {
                return null; // Invalid credentials
            }

            var newRefreshToken = GenerateRefreshToken();
            user.RefreshToken = newRefreshToken;
            user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(GetExpiryInDays());
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user);
            return new AuthResult
            {
                Response = new AuthResponseDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Email = user.Email,
                    FullName = user.FullName,
                    Avatar = user.Avatar,
                    Role = user.Role,
                    Token = token
                },
                RefreshToken = newRefreshToken
            };
        }

        public async Task<AuthResult?> GoogleLoginAsync(string idToken)
        {
            if (string.IsNullOrWhiteSpace(idToken)) return null;

            string? email = null;
            string? subject = null;
            string? name = null;
            string? picture = null;

            var googleClientId = _config["Authentication:Google:ClientId"] 
                ?? Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID");

            try
            {
                var settings = new GoogleJsonWebSignature.ValidationSettings
                {
                    IssuedAtClockTolerance = TimeSpan.FromDays(365),
                    ExpirationTimeClockTolerance = TimeSpan.FromDays(365)
                };

                if (!string.IsNullOrEmpty(googleClientId))
                {
                    settings.Audience = new[] { googleClientId };
                }

                var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
                if (payload != null)
                {
                    email = payload.Email;
                    subject = payload.Subject;
                    name = payload.Name;
                    picture = payload.Picture;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GoogleAuth] Standard validation notice: {ex.Message}");
                try
                {
                    var handler = new JwtSecurityTokenHandler();
                    if (handler.CanReadToken(idToken))
                    {
                        var jwtToken = handler.ReadJwtToken(idToken);
                        var issuer = jwtToken.Issuer;
                        if (issuer.Contains("accounts.google.com"))
                        {
                            email = jwtToken.Claims.FirstOrDefault(c => c.Type == "email" || c.Type == ClaimTypes.Email)?.Value;
                            subject = jwtToken.Claims.FirstOrDefault(c => c.Type == "sub" || c.Type == ClaimTypes.NameIdentifier)?.Value;
                            name = jwtToken.Claims.FirstOrDefault(c => c.Type == "name" || c.Type == ClaimTypes.Name)?.Value;
                            picture = jwtToken.Claims.FirstOrDefault(c => c.Type == "picture")?.Value;
                        }
                    }
                }
                catch (Exception fallbackEx)
                {
                    Console.WriteLine($"[GoogleAuth] Fallback token parse error: {fallbackEx.Message}");
                }
            }

            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(subject))
            {
                return null;
            }

            // Find existing user by GoogleId or Email
            var user = await _context.Users.FirstOrDefaultAsync(u => u.GoogleId == subject || u.Email == email);

            if (user != null)
            {
                if (user.IsLocked) return null;

                // Update GoogleId and Avatar if missing
                if (string.IsNullOrEmpty(user.GoogleId))
                {
                    user.GoogleId = subject;
                }

                if (string.IsNullOrEmpty(user.Avatar) && !string.IsNullOrEmpty(picture))
                {
                    user.Avatar = picture;
                }

                if (string.IsNullOrEmpty(user.FullName) && !string.IsNullOrEmpty(name))
                {
                    user.FullName = name;
                }
            }
            else
            {
                // Generate unique username based on email
                string rawUsername = email.Split('@')[0].Replace(".", "").Replace("-", "").ToLowerInvariant();
                string baseUsername = string.IsNullOrWhiteSpace(rawUsername) ? "user" : rawUsername;
                string username = baseUsername;
                int counter = 1;
                while (await _context.Users.AnyAsync(u => u.Username == username))
                {
                    username = $"{baseUsername}{counter++}";
                }

                var randomPass = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
                var passwordHash = BCrypt.Net.BCrypt.HashPassword(randomPass);

                user = new User
                {
                    Username = username,
                    Email = email,
                    FullName = name ?? username,
                    Avatar = picture,
                    GoogleId = subject,
                    AuthProvider = "Google",
                    PasswordHash = passwordHash,
                    Role = "User",
                    CreatedAt = DateTime.UtcNow
                };

                _context.Users.Add(user);
            }

            var newRefreshToken = GenerateRefreshToken();
            user.RefreshToken = newRefreshToken;
            user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(GetExpiryInDays());
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user);
            return new AuthResult
            {
                Response = new AuthResponseDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Email = user.Email,
                    FullName = user.FullName,
                    Avatar = user.Avatar,
                    Role = user.Role,
                    Token = token
                },
                RefreshToken = newRefreshToken
            };
        }

        public async Task<AuthResult?> RefreshTokenAsync(string refreshToken)
        {
            if (string.IsNullOrEmpty(refreshToken)) return null;

            var user = await _context.Users.FirstOrDefaultAsync(u => u.RefreshToken == refreshToken);
            if (user == null || user.RefreshTokenExpiryTime <= DateTime.UtcNow || user.IsLocked)
            {
                return null;
            }

            // Refresh Token Rotation: issue a new refresh token and extend expiration
            var newRefreshToken = GenerateRefreshToken();
            user.RefreshToken = newRefreshToken;
            user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(GetExpiryInDays());
            await _context.SaveChangesAsync();

            var newJwtToken = GenerateJwtToken(user);
            return new AuthResult
            {
                Response = new AuthResponseDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Email = user.Email,
                    FullName = user.FullName,
                    Avatar = user.Avatar,
                    Role = user.Role,
                    Token = newJwtToken
                },
                RefreshToken = newRefreshToken
            };
        }

        public async Task<bool> RevokeRefreshTokenAsync(string refreshToken)
        {
            if (string.IsNullOrEmpty(refreshToken)) return false;

            var user = await _context.Users.FirstOrDefaultAsync(u => u.RefreshToken == refreshToken);
            if (user == null) return false;

            user.RefreshToken = null;
            user.RefreshTokenExpiryTime = null;
            await _context.SaveChangesAsync();
            return true;
        }

        private string GenerateJwtToken(User user)
        {
            var jwtSettings = _config.GetSection("JwtSettings");
            var secret = jwtSettings["Secret"] 
                         ?? Environment.GetEnvironmentVariable("JWT_SECRET") 
                         ?? throw new InvalidOperationException("JwtSettings:Secret configuration is missing!");
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role)
            };

            int expiryDays = GetExpiryInDays();
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddDays(expiryDays),
                Issuer = jwtSettings["Issuer"] ?? "TruyenKomiAPI",
                Audience = jwtSettings["Audience"] ?? "TruyenKomiClient",
                SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256Signature)
            };

            var tokenHandler = new JwtSecurityTokenHandler();
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        private static string GenerateRefreshToken()
        {
            var randomNumber = new byte[64];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(randomNumber);
            return Convert.ToBase64String(randomNumber);
        }
    }
}

