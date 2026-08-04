using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using MangaFlux.API.DTOs;
using MangaFlux.API.Services;

namespace MangaFlux.API.Controllers
{
    [ApiController]
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
            return Ok(result);
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            var result = await _authService.LoginAsync(dto);
            if (result == null)
            {
                return Unauthorized(new { message = "Tài khoản hoặc mật khẩu không chính xác." });
            }
            return Ok(result);
        }
    }
}
