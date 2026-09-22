using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Services;

namespace TruyenKomi.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly IConfiguration _config;

        public AuthController(IAuthService authService, IConfiguration config)
        {
            _authService = authService;
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

        [HttpPost("register")]
        [EnableRateLimiting("auth-limiter")]
        public async Task<IActionResult> Register([FromBody] RegisterDto dto)
        {
            var result = await _authService.RegisterAsync(dto);
            if (result == null)
            {
                return BadRequest(new { message = "Tên đăng nhập hoặc email đã tồn tại." });
            }

            SetRefreshTokenCookie(result.RefreshToken);
            return Ok(result.Response);
        }

        [HttpPost("login")]
        [EnableRateLimiting("auth-limiter")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            var result = await _authService.LoginAsync(dto);
            if (result == null)
            {
                return Unauthorized(new { message = "Tài khoản hoặc mật khẩu không chính xác." });
            }

            SetRefreshTokenCookie(result.RefreshToken);
            return Ok(result.Response);
        }

        [HttpPost("google-login")]
        public async Task<IActionResult> GoogleLogin([FromBody] GoogleLoginDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.IdToken))
            {
                return BadRequest(new { message = "Google ID Token không hợp lệ." });
            }

            var result = await _authService.GoogleLoginAsync(dto.IdToken);
            if (result == null)
            {
                return Unauthorized(new { message = "Xác thực tài khoản Google thất bại hoặc tài khoản đã bị khóa." });
            }

            SetRefreshTokenCookie(result.RefreshToken);
            return Ok(result.Response);
        }

        [HttpPost("refresh-token")]
        public async Task<IActionResult> RefreshToken()
        {
            var refreshToken = Request.Cookies["truyenkomi_refresh_token"];
            if (string.IsNullOrEmpty(refreshToken))
            {
                return Unauthorized(new { message = "Không tìm thấy Refresh Token." });
            }

            var result = await _authService.RefreshTokenAsync(refreshToken);
            if (result == null)
            {
                ClearRefreshTokenCookie();
                return Unauthorized(new { message = "Refresh Token không hợp lệ hoặc đã hết hạn." });
            }

            SetRefreshTokenCookie(result.RefreshToken);
            return Ok(result.Response);
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var refreshToken = Request.Cookies["truyenkomi_refresh_token"];
            if (!string.IsNullOrEmpty(refreshToken))
            {
                await _authService.RevokeRefreshTokenAsync(refreshToken);
            }

            ClearRefreshTokenCookie();
            return Ok(new { message = "Đăng xuất thành công." });
        }

        private void SetRefreshTokenCookie(string refreshToken)
        {
            int days = GetExpiryInDays();
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Expires = DateTime.UtcNow.AddDays(days),
                MaxAge = TimeSpan.FromDays(days),
                SameSite = SameSiteMode.Lax,
                Secure = Request.IsHttps,
                Path = "/api/auth"
            };
            Response.Cookies.Append("truyenkomi_refresh_token", refreshToken, cookieOptions);
        }

        private void ClearRefreshTokenCookie()
        {
            Response.Cookies.Delete("truyenkomi_refresh_token", new CookieOptions
            {
                HttpOnly = true,
                SameSite = SameSiteMode.Lax,
                Secure = Request.IsHttps,
                Path = "/api/auth"
            });
        }
    }
}

