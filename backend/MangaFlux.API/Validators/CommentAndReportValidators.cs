using FluentValidation;
using TruyenKomi.API.DTOs;

namespace TruyenKomi.API.Validators
{
    public class CreateCommentDtoValidator : AbstractValidator<CreateCommentDto>
    {
        public CreateCommentDtoValidator()
        {
            RuleFor(x => x.ComicId)
                .GreaterThan(0).WithMessage("ComicId không hợp lệ.");

            RuleFor(x => x.Content)
                .NotEmpty().WithMessage("Nội dung bình luận không được để trống.")
                .MaximumLength(2000).WithMessage("Bình luận không được vượt quá 2000 ký tự.");
        }
    }

    public class ReportCommentDtoValidator : AbstractValidator<ReportCommentDto>
    {
        public ReportCommentDtoValidator()
        {
            RuleFor(x => x.Reason)
                .NotEmpty().WithMessage("Lý do báo cáo không được để trống.")
                .MaximumLength(500).WithMessage("Lý do báo cáo không được vượt quá 500 ký tự.");
        }
    }

    public class CreateReportDtoValidator : AbstractValidator<CreateReportDto>
    {
        public CreateReportDtoValidator()
        {
            RuleFor(x => x.ComicId)
                .GreaterThan(0).WithMessage("ComicId không hợp lệ.");

            RuleFor(x => x.ErrorType)
                .NotEmpty().WithMessage("Loại lỗi không được để trống.")
                .MaximumLength(100).WithMessage("Loại lỗi không hợp lệ.");

            RuleFor(x => x.Description)
                .MaximumLength(2000).WithMessage("Mô tả chi tiết không được vượt quá 2000 ký tự.");

            RuleFor(x => x.ReporterName)
                .MaximumLength(100).WithMessage("Tên người báo lỗi không được vượt quá 100 ký tự.");
        }
    }

    public class UpdateProfileDtoValidator : AbstractValidator<UpdateProfileDto>
    {
        public UpdateProfileDtoValidator()
        {
            RuleFor(x => x.FullName)
                .MaximumLength(100).WithMessage("Họ và tên không được vượt quá 100 ký tự.");

            RuleFor(x => x.Email)
                .EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Địa chỉ email không đúng định dạng.")
                .MaximumLength(100).WithMessage("Email không được dài quá 100 ký tự.");
        }
    }
}
