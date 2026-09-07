using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TruyenKomi.API.Data;
using TruyenKomi.API.DTOs;
using TruyenKomi.API.Models;

namespace TruyenKomi.API.Services
{
    public interface IGamificationService
    {
        RealmInfoDto CalculateRealm(int exp);
        Task<GamificationProfileDto?> GetProfileAsync(int userId);
        Task<CheckInResultDto> CheckInDailyAsync(int userId);
        Task<AddExpResultDto> AddExpAsync(int userId, int expAmount, string reason);
        Task<bool> EquipFrameAsync(int userId, string frameId);
        Task<List<LeaderboardItemDto>> GetLeaderboardAsync(int limit = 20);
        bool HasCheckedInToday(DateTime? lastAttendanceDate);
    }

    public class GamificationService : IGamificationService
    {
        private readonly MangaDbContext _context;

        public GamificationService(MangaDbContext context)
        {
            _context = context;
        }

        public RealmInfoDto CalculateRealm(int exp)
        {
            if (exp < 0) exp = 0;

            if (exp < 500)
            {
                // Luyện Khí: Cấp 1 -> 9 (mỗi cấp ~50 EXP)
                int level = Math.Min(9, Math.Max(1, (exp / 50) + 1));
                string stage = level <= 3 ? "Sơ Kỳ" : (level <= 6 ? "Trung Kỳ" : (level <= 8 ? "Hậu Kỳ" : "Viên Mãn"));
                return new RealmInfoDto
                {
                    Name = "Luyện Khí",
                    Stage = stage,
                    Title = $"Luyện Khí {stage} - Cấp {level}",
                    Level = level,
                    Color = "#10b981",
                    FrameClass = "avatar-frame-luyen-khi",
                    AuraDescription = "Lục quang thanh sơ - Hộ thể sơ cấp"
                };
            }
            else if (exp < 1500)
            {
                // Trúc Cơ: Cấp 10 -> 19 (mỗi cấp ~100 EXP)
                int level = Math.Min(19, 10 + ((exp - 500) / 100));
                string stage = level <= 12 ? "Sơ Kỳ" : (level <= 15 ? "Trung Kỳ" : (level <= 18 ? "Hậu Kỳ" : "Viên Mãn"));
                return new RealmInfoDto
                {
                    Name = "Trúc Cơ",
                    Stage = stage,
                    Title = $"Trúc Cơ {stage} - Cấp {level}",
                    Level = level,
                    Color = "#06b6d4",
                    FrameClass = "avatar-frame-truc-co",
                    AuraDescription = "Thủy lam phiêu dật - Linh căn ngưng tụ"
                };
            }
            else if (exp < 3500)
            {
                // Kim Đan: Cấp 20 -> 29 (mỗi cấp ~200 EXP)
                int level = Math.Min(29, 20 + ((exp - 1500) / 200));
                string stage = level <= 22 ? "Sơ Kỳ" : (level <= 25 ? "Trung Kỳ" : (level <= 28 ? "Hậu Kỳ" : "Viên Mãn"));
                return new RealmInfoDto
                {
                    Name = "Kim Đan",
                    Stage = stage,
                    Title = $"Kim Đan {stage} - Cấp {level}",
                    Level = level,
                    Color = "#eab308",
                    FrameClass = "avatar-frame-kim-dan",
                    AuraDescription = "Hoàng kim lộng lẫy - Đan thành bất diệt"
                };
            }
            else if (exp < 7000)
            {
                // Nguyên Anh: Cấp 30 -> 39 (mỗi cấp ~350 EXP)
                int level = Math.Min(39, 30 + ((exp - 3500) / 350));
                string stage = level <= 32 ? "Sơ Kỳ" : (level <= 35 ? "Trung Kỳ" : (level <= 38 ? "Hậu Kỳ" : "Viên Mãn"));
                return new RealmInfoDto
                {
                    Name = "Nguyên Anh",
                    Stage = stage,
                    Title = $"Nguyên Anh {stage} - Cấp {level}",
                    Level = level,
                    Color = "#a855f7",
                    FrameClass = "avatar-frame-nguyen-anh",
                    AuraDescription = "Tử khí đông lai - Xuất khiếu thông thần"
                };
            }
            else if (exp < 12000)
            {
                // Hóa Thần: Cấp 40 -> 49 (mỗi cấp ~500 EXP)
                int level = Math.Min(49, 40 + ((exp - 7000) / 500));
                string stage = level <= 42 ? "Sơ Kỳ" : (level <= 45 ? "Trung Kỳ" : (level <= 48 ? "Hậu Kỳ" : "Viên Mãn"));
                return new RealmInfoDto
                {
                    Name = "Hóa Thần",
                    Stage = stage,
                    Title = $"Hóa Thần {stage} - Cấp {level}",
                    Level = level,
                    Color = "#ef4444",
                    FrameClass = "avatar-frame-hoa-than",
                    AuraDescription = "Chu tước thần hỏa - Dung nhập thiên địa"
                };
            }
            else
            {
                // Độ Kiếp: Cấp 50+ (mỗi cấp ~800 EXP)
                int level = 50 + ((exp - 12000) / 800);
                string stage = level <= 52 ? "Sơ Kỳ" : (level <= 55 ? "Trung Kỳ" : (level <= 58 ? "Hậu Kỳ" : "Viên Mãn Phi Thăng"));
                return new RealmInfoDto
                {
                    Name = "Độ Kiếp",
                    Stage = stage,
                    Title = $"Độ Kiếp {stage} - Cấp {level}",
                    Level = level,
                    Color = "#ec4899",
                    FrameClass = "avatar-frame-do-kiep",
                    AuraDescription = "Ngũ sắc lôi kiếp - Vũ trụ chí tôn"
                };
            }
        }

        private (int currentLevelExp, int expForNextLevel, double percent) CalculateProgress(int exp)
        {
            if (exp < 500)
            {
                int baseExp = ((exp / 50)) * 50;
                int inLevel = exp - baseExp;
                return (inLevel, 50, Math.Round((double)inLevel / 50 * 100, 1));
            }
            else if (exp < 1500)
            {
                int baseExp = 500 + (((exp - 500) / 100)) * 100;
                int inLevel = exp - baseExp;
                return (inLevel, 100, Math.Round((double)inLevel / 100 * 100, 1));
            }
            else if (exp < 3500)
            {
                int baseExp = 1500 + (((exp - 1500) / 200)) * 200;
                int inLevel = exp - baseExp;
                return (inLevel, 200, Math.Round((double)inLevel / 200 * 100, 1));
            }
            else if (exp < 7000)
            {
                int baseExp = 3500 + (((exp - 3500) / 350)) * 350;
                int inLevel = exp - baseExp;
                return (inLevel, 350, Math.Round((double)inLevel / 350 * 100, 1));
            }
            else if (exp < 12000)
            {
                int baseExp = 7000 + (((exp - 7000) / 500)) * 500;
                int inLevel = exp - baseExp;
                return (inLevel, 500, Math.Round((double)inLevel / 500 * 100, 1));
            }
            else
            {
                int baseExp = 12000 + (((exp - 12000) / 800)) * 800;
                int inLevel = exp - baseExp;
                return (inLevel, 800, Math.Round((double)inLevel / 800 * 100, 1));
            }
        }

        public bool HasCheckedInToday(DateTime? lastAttendanceDate)
        {
            if (!lastAttendanceDate.HasValue) return false;
            var todayVn = DateTime.UtcNow.AddHours(7).Date;
            var lastVn = lastAttendanceDate.Value.AddHours(7).Date;
            return lastVn == todayVn;
        }

        public async Task<GamificationProfileDto?> GetProfileAsync(int userId)
        {
            var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return null;

            var realm = CalculateRealm(user.Exp);
            var (currentLevelExp, expForNextLevel, percent) = CalculateProgress(user.Exp);
            var hasCheckedIn = HasCheckedInToday(user.LastAttendanceDate);

            var activeFrame = string.IsNullOrEmpty(user.AvatarFrame) ? "frame-default" : user.AvatarFrame;

            var allFrames = GetAvailableFrames(user.Exp, user.ActiveBadge, activeFrame);

            return new GamificationProfileDto
            {
                UserId = user.Id,
                Username = user.Username,
                Avatar = user.Avatar,
                Exp = user.Exp,
                Realm = realm,
                CurrentLevelExp = currentLevelExp,
                ExpForNextLevel = expForNextLevel,
                ProgressPercent = percent,
                AttendanceStreak = user.AttendanceStreak,
                HasCheckedInToday = hasCheckedIn,
                ActiveFrame = activeFrame,
                ActiveBadge = user.ActiveBadge,
                UnlockedFrames = allFrames
            };
        }

        public async Task<CheckInResultDto> CheckInDailyAsync(int userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
            {
                return new CheckInResultDto { Success = false, Message = "Không tìm thấy người dùng." };
            }

            var todayVn = DateTime.UtcNow.AddHours(7).Date;
            if (user.LastAttendanceDate.HasValue)
            {
                var lastVn = user.LastAttendanceDate.Value.AddHours(7).Date;
                if (lastVn == todayVn)
                {
                    return new CheckInResultDto
                    {
                        Success = false,
                        Message = "Hôm nay bạn đã điểm danh rồi. Hãy quay lại vào ngày mai nhé!",
                        TotalExp = user.Exp,
                        Streak = user.AttendanceStreak
                    };
                }

                // Check if streak continues (was yesterday)
                if (lastVn == todayVn.AddDays(-1))
                {
                    user.AttendanceStreak += 1;
                }
                else
                {
                    user.AttendanceStreak = 1;
                }
            }
            else
            {
                user.AttendanceStreak = 1;
            }

            int expGained = 20;
            // Streak bonus every 7 days (+10 bonus EXP)
            if (user.AttendanceStreak % 7 == 0)
            {
                expGained += 10;
            }

            int oldExp = user.Exp;
            user.Exp += expGained;
            user.LastAttendanceDate = DateTime.UtcNow;

            var oldRealm = CalculateRealm(oldExp);
            var newRealm = CalculateRealm(user.Exp);
            bool leveledUp = newRealm.Level > oldRealm.Level;

            await _context.SaveChangesAsync();

            string msg = $"Điểm danh thành công! Nhận +{expGained} EXP tu vi." +
                         (user.AttendanceStreak > 1 ? $" Chuỗi điểm danh: {user.AttendanceStreak} ngày liên tiếp 🔥" : "");

            return new CheckInResultDto
            {
                Success = true,
                Message = msg,
                ExpGained = expGained,
                TotalExp = user.Exp,
                Streak = user.AttendanceStreak,
                LeveledUp = leveledUp,
                NewRealm = newRealm
            };
        }

        public async Task<AddExpResultDto> AddExpAsync(int userId, int expAmount, string reason)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
            {
                return new AddExpResultDto();
            }

            int oldExp = user.Exp;
            user.Exp += expAmount;

            var oldRealm = CalculateRealm(oldExp);
            var newRealm = CalculateRealm(user.Exp);
            bool leveledUp = newRealm.Level > oldRealm.Level;

            await _context.SaveChangesAsync();

            return new AddExpResultDto
            {
                ExpAdded = expAmount,
                NewTotalExp = user.Exp,
                LeveledUp = leveledUp,
                Realm = newRealm
            };
        }

        public async Task<bool> EquipFrameAsync(int userId, string frameId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return false;

            var frames = GetAvailableFrames(user.Exp, user.ActiveBadge, user.AvatarFrame ?? "frame-default");
            var selected = frames.FirstOrDefault(f => f.Id == frameId);

            if (selected == null || !selected.IsUnlocked)
            {
                return false;
            }

            user.AvatarFrame = frameId;
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<List<LeaderboardItemDto>> GetLeaderboardAsync(int limit = 20)
        {
            var topUsers = await _context.Users
                .AsNoTracking()
                .Where(u => !u.IsLocked)
                .OrderByDescending(u => u.Exp)
                .ThenBy(u => u.CreatedAt)
                .Take(limit)
                .ToListAsync();

            var result = new List<LeaderboardItemDto>();
            int rank = 1;

            foreach (var u in topUsers)
            {
                var realm = CalculateRealm(u.Exp);
                string? badge = u.ActiveBadge;
                if (string.IsNullOrEmpty(badge))
                {
                    if (rank == 1) badge = "Đệ Nhất Độc Giả 👑";
                    else if (rank == 2) badge = "Đệ Nhị Độc Giả 🥈";
                    else if (rank == 3) badge = "Đệ Tam Độc Giả 🥉";
                    else if (rank <= 10) badge = "Top Độc Giả ✨";
                }

                result.Add(new LeaderboardItemDto
                {
                    Rank = rank++,
                    UserId = u.Id,
                    Username = u.Username,
                    FullName = u.FullName,
                    Avatar = u.Avatar,
                    Exp = u.Exp,
                    Realm = realm,
                    ActiveFrame = string.IsNullOrEmpty(u.AvatarFrame) ? realm.FrameClass : u.AvatarFrame,
                    ActiveBadge = badge,
                    AttendanceStreak = u.AttendanceStreak
                });
            }

            return result;
        }

        private List<AvatarFrameDto> GetAvailableFrames(int exp, string? activeBadge, string currentFrame)
        {
            return new List<AvatarFrameDto>
            {
                new AvatarFrameDto
                {
                    Id = "frame-default",
                    Name = "Khung Tiêu Chuẩn",
                    FrameClass = "avatar-frame-default",
                    RequiredRealm = "Mặc định",
                    RequiredExp = 0,
                    IsUnlocked = true,
                    IsActive = currentFrame == "frame-default" || string.IsNullOrEmpty(currentFrame),
                    Description = "Khung viền tròn cơ bản, thanh lịch"
                },
                new AvatarFrameDto
                {
                    Id = "avatar-frame-luyen-khi",
                    Name = "Hào Quang Luyện Khí",
                    FrameClass = "avatar-frame-luyen-khi",
                    RequiredRealm = "Luyện Khí",
                    RequiredExp = 0,
                    IsUnlocked = exp >= 0,
                    IsActive = currentFrame == "avatar-frame-luyen-khi",
                    Description = "Vầng sáng lục bảo huyền dịu bao bọc sơ tâm tu tiên"
                },
                new AvatarFrameDto
                {
                    Id = "avatar-frame-truc-co",
                    Name = "Thủy Lam Trúc Cơ",
                    FrameClass = "avatar-frame-truc-co",
                    RequiredRealm = "Trúc Cơ",
                    RequiredExp = 500,
                    IsUnlocked = exp >= 500,
                    IsActive = currentFrame == "avatar-frame-truc-co",
                    Description = "Hào quang lam thủy tinh gợn sóng luân chuyển tinh tế"
                },
                new AvatarFrameDto
                {
                    Id = "avatar-frame-kim-dan",
                    Name = "Hoàng Kim Đan Quang",
                    FrameClass = "avatar-frame-kim-dan",
                    RequiredRealm = "Kim Đan",
                    RequiredExp = 1500,
                    IsUnlocked = exp >= 1500,
                    IsActive = currentFrame == "avatar-frame-kim-dan",
                    Description = "Kim quang sáng chói xoay vòng uy nghiêm bất hoại"
                },
                new AvatarFrameDto
                {
                    Id = "avatar-frame-nguyen-anh",
                    Name = "Tử Khí Nguyên Anh",
                    FrameClass = "avatar-frame-nguyen-anh",
                    RequiredRealm = "Nguyên Anh",
                    RequiredExp = 3500,
                    IsUnlocked = exp >= 3500,
                    IsActive = currentFrame == "avatar-frame-nguyen-anh",
                    Description = "Tử khí đông lai thần bí, sương mây huyền ảo đảo vòng"
                },
                new AvatarFrameDto
                {
                    Id = "avatar-frame-hoa-than",
                    Name = "Thần Hỏa Hóa Thần",
                    FrameClass = "avatar-frame-hoa-than",
                    RequiredRealm = "Hóa Thần",
                    RequiredExp = 7000,
                    IsUnlocked = exp >= 7000,
                    IsActive = currentFrame == "avatar-frame-hoa-than",
                    Description = "Ngọn lửa Chu Tước rực đỏ bập bùng thiêu đốt đất trời"
                },
                new AvatarFrameDto
                {
                    Id = "avatar-frame-do-kiep",
                    Name = "Ngũ Sắc Lôi Kiếp",
                    FrameClass = "avatar-frame-do-kiep",
                    RequiredRealm = "Độ Kiếp",
                    RequiredExp = 12000,
                    IsUnlocked = exp >= 12000,
                    IsActive = currentFrame == "avatar-frame-do-kiep",
                    Description = "Cầu vồng thần lôi vũ trụ tối thượng chuyển sắc liên tục"
                },
                new AvatarFrameDto
                {
                    Id = "avatar-frame-top-reader",
                    Name = "Vương Miện Top Độc Giả",
                    FrameClass = "avatar-frame-top-reader",
                    RequiredRealm = "Top Độc Giả",
                    RequiredExp = 1000,
                    IsUnlocked = exp >= 1000 || (activeBadge != null && activeBadge.Contains("Top")),
                    IsActive = currentFrame == "avatar-frame-top-reader",
                    Description = "Vương miện hoàng gia vàng rực rỡ tôn vinh người đọc chăm chỉ"
                }
            };
        }
    }
}
