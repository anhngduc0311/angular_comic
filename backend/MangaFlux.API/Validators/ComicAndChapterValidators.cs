using FluentValidation;
using TruyenKomi.API.DTOs;

namespace TruyenKomi.API.Validators
{
    public class ComicCreateUpdateDtoValidator : AbstractValidator<ComicCreateUpdateDto>
    {
        public ComicCreateUpdateDtoValidator()
        {
            RuleFor(x => x.Title)
                .NotEmpty().WithMessage("Tên truyện không được để trống.")
                .MaximumLength(255).WithMessage("Tên truyện không được dài quá 255 ký tự.");

            RuleFor(x => x.Slug)
                .NotEmpty().WithMessage("Slug truyện không được để trống.")
                .MaximumLength(255).WithMessage("Slug truyện không được dài quá 255 ký tự.")
                .Matches(@"^[a-z0-9-]+$").WithMessage("Slug chỉ được chứa chữ cái thường, số và dấu gạch ngang.");

            RuleFor(x => x.Author)
                .MaximumLength(150).WithMessage("Tên tác giả không được dài quá 150 ký tự.");

            RuleFor(x => x.Artist)
                .MaximumLength(150).WithMessage("Tên họa sĩ không được dài quá 150 ký tự.");
        }
    }

    public class ChapterCreateDtoValidator : AbstractValidator<ChapterCreateDto>
    {
        public ChapterCreateDtoValidator()
        {
            RuleFor(x => x.ComicId)
                .GreaterThanOrEqualTo(0).WithMessage("ComicId không hợp lệ.");

            RuleFor(x => x.ChapterNumber)
                .GreaterThanOrEqualTo(0).WithMessage("Số thứ tự chapter phải lớn hơn hoặc bằng 0.");

            RuleFor(x => x.Title)
                .MaximumLength(255).WithMessage("Tiêu đề chapter không được dài quá 255 ký tự.");
        }
    }

    public class CategoryCreateUpdateDtoValidator : AbstractValidator<CategoryCreateUpdateDto>
    {
        public CategoryCreateUpdateDtoValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty().WithMessage("Tên thể loại không được để trống.")
                .MaximumLength(100).WithMessage("Tên thể loại không được dài quá 100 ký tự.");

            RuleFor(x => x.Slug)
                .NotEmpty().WithMessage("Slug thể loại không được để trống.")
                .MaximumLength(100).WithMessage("Slug thể loại không được dài quá 100 ký tự.")
                .Matches(@"^[a-z0-9-]+$").WithMessage("Slug chỉ được chứa chữ cái thường, số và dấu gạch ngang.");
        }
    }
}
