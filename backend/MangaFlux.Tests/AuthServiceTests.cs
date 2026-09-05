using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Services;
using Xunit;

namespace TruyenKomi.Tests
{
    public class AuthServiceTests
    {
        private MangaDbContext GetInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<MangaDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            return new MangaDbContext(options);
        }

        private IConfiguration GetMockConfiguration()
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                {"JwtSettings:Secret", "SuperSecretKeyForTruyenKomiUnitTesting2026!"},
                {"JwtSettings:Issuer", "TruyenKomiTest"},
                {"JwtSettings:Audience", "TruyenKomiClientTest"}
            };

            return new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();
        }

        [Fact]
        public async Task RegisterAsync_ShouldCreateUser_WhenValidDtoProvided()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var config = GetMockConfiguration();
            var service = new AuthService(db, config);

            var dto = new RegisterDto
            {
                Username = "testuser",
                Email = "testuser@example.com",
                Password = "Password123!",
                FullName = "Test User"
            };

            // Act
            var result = await service.RegisterAsync(dto);

            // Assert
            Assert.NotNull(result);
            Assert.Equal("testuser", result!.Response.Username);
            Assert.Equal("User", result.Response.Role);
            Assert.False(string.IsNullOrEmpty(result.Response.Token));
            Assert.False(string.IsNullOrEmpty(result.RefreshToken));
        }

        [Fact]
        public async Task RegisterAsync_ShouldReturnNull_WhenUsernameExists()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var config = GetMockConfiguration();
            var service = new AuthService(db, config);

            var firstUser = new RegisterDto
            {
                Username = "duplicateUser",
                Email = "user1@example.com",
                Password = "Password123!"
            };
            await service.RegisterAsync(firstUser);

            var secondUser = new RegisterDto
            {
                Username = "duplicateUser",
                Email = "user2@example.com",
                Password = "Password123!"
            };

            // Act
            var result = await service.RegisterAsync(secondUser);

            // Assert
            Assert.Null(result);
        }

        [Fact]
        public async Task RefreshTokenAsync_ShouldRotateToken_WhenValid()
        {
            // Arrange
            var db = GetInMemoryDbContext();
            var config = GetMockConfiguration();
            var service = new AuthService(db, config);

            var regResult = await service.RegisterAsync(new RegisterDto
            {
                Username = "refreshtest",
                Email = "refreshtest@example.com",
                Password = "Password123!"
            });

            var oldRefreshToken = regResult!.RefreshToken;

            // Act
            var refreshResult = await service.RefreshTokenAsync(oldRefreshToken);

            // Assert
            Assert.NotNull(refreshResult);
            Assert.NotEqual(oldRefreshToken, refreshResult!.RefreshToken);
            Assert.False(string.IsNullOrEmpty(refreshResult.Response.Token));
        }
    }
}

