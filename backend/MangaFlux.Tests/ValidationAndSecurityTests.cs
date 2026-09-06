using System;
using System.Linq;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Services;
using TruyenKomi.API.Validators;
using Xunit;

namespace TruyenKomi.Tests
{
    public class ValidationAndSecurityTests
    {
        [Theory]
        [InlineData("<script>alert('xss')</script>Hello World", "Hello World")]
        [InlineData("<img src=x onerror=alert(1)>Nice comic!", "Nice comic!")]
        [InlineData("<a href=\"javascript:alert('pwned')\">Click me</a>", "Click me")]
        [InlineData("<b>Bold</b> and <i>Italic</i> text", "Bold and Italic text")]
        [InlineData("Clean normal comment", "Clean normal comment")]
        public void InputSanitizer_ShouldStripDangerousHtmlAndScripts(string input, string expected)
        {
            // Act
            var sanitized = InputSanitizer.SanitizePlainText(input);

            // Assert
            Assert.Equal(expected, sanitized);
        }

        [Fact]
        public void RegisterDtoValidator_ShouldValidateCorrectly()
        {
            var validator = new RegisterDtoValidator();

            // Invalid DTO: empty fields, bad email, short password, special chars in username
            var invalidDto = new RegisterDto
            {
                Username = "user@name#bad!",
                Email = "not-an-email",
                Password = "123",
                FullName = "A"
            };

            var invalidResult = validator.Validate(invalidDto);
            Assert.False(invalidResult.IsValid);
            Assert.Contains(invalidResult.Errors, e => e.PropertyName == nameof(RegisterDto.Username));
            Assert.Contains(invalidResult.Errors, e => e.PropertyName == nameof(RegisterDto.Email));
            Assert.Contains(invalidResult.Errors, e => e.PropertyName == nameof(RegisterDto.Password));

            // Valid DTO
            var validDto = new RegisterDto
            {
                Username = "valid_user.99",
                Email = "valid.user@example.com",
                Password = "SuperSecurePassword123!",
                FullName = "Nguyen Van A"
            };

            var validResult = validator.Validate(validDto);
            Assert.True(validResult.IsValid);
        }

        [Fact]
        public void CreateCommentDtoValidator_ShouldRejectEmptyOrInvalidComments()
        {
            var validator = new CreateCommentDtoValidator();

            var emptyDto = new CreateCommentDto
            {
                ComicId = 0,
                Content = ""
            };

            var result = validator.Validate(emptyDto);
            Assert.False(result.IsValid);
            Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateCommentDto.ComicId));
            Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateCommentDto.Content));

            var validDto = new CreateCommentDto
            {
                ComicId = 5,
                Content = "Truyện này rất hay và cuốn hút!"
            };

            var validResult = validator.Validate(validDto);
            Assert.True(validResult.IsValid);
        }

        [Fact]
        public void ChangePasswordDtoValidator_ShouldRejectSamePasswordOrShortPassword()
        {
            var validator = new ChangePasswordDtoValidator();

            var samePasswordDto = new ChangePasswordDto
            {
                CurrentPassword = "Password123!",
                NewPassword = "Password123!"
            };

            var result = validator.Validate(samePasswordDto);
            Assert.False(result.IsValid);
            Assert.Contains(result.Errors, e => e.PropertyName == nameof(ChangePasswordDto.NewPassword));

            var validDto = new ChangePasswordDto
            {
                CurrentPassword = "OldPassword123!",
                NewPassword = "NewAwesomePassword456!"
            };

            var validResult = validator.Validate(validDto);
            Assert.True(validResult.IsValid);
        }
    }
}
