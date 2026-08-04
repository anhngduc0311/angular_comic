using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using MangaFlux.API.Data;
using MangaFlux.API.DTOs;
using MangaFlux.API.Models;

namespace MangaFlux.API.Services
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

        public async Task<AuthResult?> RegisterAsync(RegisterDto dto)
        {
            if (await _context.Users.AnyAsync(u => u.Username == dto.Username || u.Email == dto.Email))
            {
                return null; // Username or Email already exists
            }

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
                RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(7)
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
            user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(7);
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
            user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(7);
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

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddMinutes(30),
                Issuer = jwtSettings["Issuer"] ?? "MangaFluxAPI",
                Audience = jwtSettings["Audience"] ?? "MangaFluxClient",
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

