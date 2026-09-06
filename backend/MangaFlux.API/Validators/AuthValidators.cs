using FluentValidation;
using TruyenKomi.API.DTOs;

namespace TruyenKomi.API.Validators
{
    public class RegisterDtoValidator : AbstractValidator<RegisterDto>
    {
        public RegisterDtoValidator()
        {
            RuleFor(x => x.Username)
                .NotEmpty().WithMessage("Tên đăng nhập không được để trống.")
                .Length(3, 50).WithMessage("Tên đăng nhập phải có từ 3 đến 50 ký tự.")
                .Matches(@"^[a-zA-Z0-9_\.]+$").WithMessage("Tên đăng nhập chỉ được chứa chữ cái, số, dấu gạch dưới và dấu chấm.");

            RuleFor(x => x.Email)
                .NotEmpty().WithMessage("Email không được để trống.")
                .EmailAddress().WithMessage("Địa chỉ email không đúng định dạng.")
                .MaximumLength(100).WithMessage("Email không được dài quá 100 ký tự.");

            RuleFor(x => x.Password)
                .NotEmpty().WithMessage("Mật khẩu không được để trống.")
                .MinimumLength(6).WithMessage("Mật khẩu phải có tối thiểu 6 ký tự.")
                .MaximumLength(100).WithMessage("Mật khẩu không được dài quá 100 ký tự.");

            RuleFor(x => x.FullName)
                .MaximumLength(100).WithMessage("Họ và tên không được dài quá 100 ký tự.");
        }
    }

    public class LoginDtoValidator : AbstractValidator<LoginDto>
    {
        public LoginDtoValidator()
        {
            RuleFor(x => x.UsernameOrEmail)
                .NotEmpty().WithMessage("Vui lòng nhập tên đăng nhập hoặc email.")
                .MaximumLength(100).WithMessage("Tên đăng nhập/email không hợp lệ.");

            RuleFor(x => x.Password)
                .NotEmpty().WithMessage("Vui lòng nhập mật khẩu.");
        }
    }

    public class ChangePasswordDtoValidator : AbstractValidator<ChangePasswordDto>
    {
        public ChangePasswordDtoValidator()
        {
            RuleFor(x => x.CurrentPassword)
                .NotEmpty().WithMessage("Vui lòng nhập mật khẩu hiện tại.");

            RuleFor(x => x.NewPassword)
                .NotEmpty().WithMessage("Vui lòng nhập mật khẩu mới.")
                .MinimumLength(6).WithMessage("Mật khẩu mới phải có tối thiểu 6 ký tự.")
                .MaximumLength(100).WithMessage("Mật khẩu mới không được dài quá 100 ký tự.")
                .NotEqual(x => x.CurrentPassword).WithMessage("Mật khẩu mới không được trùng với mật khẩu hiện tại.");
        }
    }
}
