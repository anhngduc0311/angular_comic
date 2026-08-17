using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MangaFlux.API.DTOs;
using MangaFlux.API.Services;

namespace MangaFlux.API.Controllers
{
    [ApiController]
    [EnableRateLimiting("auth-limiter")]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;

        public AuthController(IAuthService authService)
        {
            _authService = authService;
        }

        [HttpPost("register")]
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

        [HttpPost("refresh-token")]
        public async Task<IActionResult> RefreshToken()
        {
            var refreshToken = Request.Cookies["mangaflux_refresh_token"];
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
            var refreshToken = Request.Cookies["mangaflux_refresh_token"];
            if (!string.IsNullOrEmpty(refreshToken))
            {
                await _authService.RevokeRefreshTokenAsync(refreshToken);
            }

            ClearRefreshTokenCookie();
            return Ok(new { message = "Đăng xuất thành công." });
        }

        private void SetRefreshTokenCookie(string refreshToken)
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Expires = DateTime.UtcNow.AddDays(7),
                SameSite = SameSiteMode.Lax,
                Secure = Request.IsHttps,
                Path = "/api/auth"
            };
            Response.Cookies.Append("mangaflux_refresh_token", refreshToken, cookieOptions);
        }

        private void ClearRefreshTokenCookie()
        {
            Response.Cookies.Delete("mangaflux_refresh_token", new CookieOptions
            {
                HttpOnly = true,
                SameSite = SameSiteMode.Lax,
                Secure = Request.IsHttps,
                Path = "/api/auth"
            });
        }
    }
}

