using System;
using System.Collections.Generic;

namespace TruyenKomi.API.DTOs
{
    public class RealmInfoDto
    {
        public string Name { get; set; } = string.Empty; // "Luyện Khí", "Trúc Cơ", ...
        public string Stage { get; set; } = string.Empty; // "Sơ Kỳ", "Trung Kỳ", "Hậu Kỳ", "Viên Mãn"
        public string Title { get; set; } = string.Empty; // "Trúc Cơ Trung Kỳ - Cấp 14"
        public int Level { get; set; }
        public string Color { get; set; } = string.Empty;
        public string FrameClass { get; set; } = string.Empty;
        public string AuraDescription { get; set; } = string.Empty;
    }

    public class GamificationProfileDto
    {
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string? Avatar { get; set; }
        public int Exp { get; set; }
        public RealmInfoDto Realm { get; set; } = new();
        public int CurrentLevelExp { get; set; }
        public int ExpForNextLevel { get; set; }
        public double ProgressPercent { get; set; }
        public int AttendanceStreak { get; set; }
        public bool HasCheckedInToday { get; set; }
        public string ActiveFrame { get; set; } = "frame-default";
        public string? ActiveBadge { get; set; }
        public List<AvatarFrameDto> UnlockedFrames { get; set; } = new();
    }

    public class AvatarFrameDto
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string FrameClass { get; set; } = string.Empty;
        public string RequiredRealm { get; set; } = string.Empty;
        public int RequiredExp { get; set; }
        public bool IsUnlocked { get; set; }
        public bool IsActive { get; set; }
        public string Description { get; set; } = string.Empty;
    }

    public class CheckInResultDto
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public int ExpGained { get; set; }
        public int TotalExp { get; set; }
        public int Streak { get; set; }
        public bool LeveledUp { get; set; }
        public RealmInfoDto? NewRealm { get; set; }
    }

    public class LeaderboardItemDto
    {
        public int Rank { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string? FullName { get; set; }
        public string? Avatar { get; set; }
        public int Exp { get; set; }
        public RealmInfoDto Realm { get; set; } = new();
        public string ActiveFrame { get; set; } = "frame-default";
        public string? ActiveBadge { get; set; }
        public int AttendanceStreak { get; set; }
    }

    public class EquipFrameDto
    {
        public string FrameId { get; set; } = string.Empty;
    }

    public class AddExpResultDto
    {
        public int ExpAdded { get; set; }
        public int NewTotalExp { get; set; }
        public bool LeveledUp { get; set; }
        public RealmInfoDto Realm { get; set; } = new();
    }
}
