using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MangaFlux.API.Data;
using MangaFlux.API.DTOs;
using MangaFlux.API.Services;
using Xunit;

namespace MangaFlux.Tests
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
                {"JwtSettings:Secret", "SuperSecretKeyForMangaFluxUnitTesting2026!"},
                {"JwtSettings:Issuer", "MangaFluxTest"},
                {"JwtSettings:Audience", "MangaFluxClientTest"}
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
            Assert.Equal("testuser", result!.Username);
            Assert.Equal("User", result.Role);
            Assert.False(string.IsNullOrEmpty(result.Token));
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
    }
}
