using Microsoft.EntityFrameworkCore;
using TruyenKomi.API.Models;

namespace TruyenKomi.API.Data
{
    public class MangaDbContext : DbContext
    {
        public MangaDbContext(DbContextOptions<MangaDbContext> options) : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<Category> Categories => Set<Category>();
        public DbSet<Comic> Comics => Set<Comic>();
        public DbSet<ComicCategory> ComicCategories => Set<ComicCategory>();
        public DbSet<Chapter> Chapters => Set<Chapter>();
        public DbSet<ChapterPage> ChapterPages => Set<ChapterPage>();
        public DbSet<Bookmark> Bookmarks => Set<Bookmark>();
        public DbSet<ReadingHistory> ReadingHistories => Set<ReadingHistory>();
        public DbSet<Comment> Comments => Set<Comment>();
        public DbSet<CommentLike> CommentLikes => Set<CommentLike>();
        public DbSet<Notification> Notifications => Set<Notification>();
        public DbSet<Report> Reports => Set<Report>();
        public DbSet<ComicRating> ComicRatings => Set<ComicRating>();


        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Composite Key for ComicCategory Many-to-Many
            modelBuilder.Entity<ComicCategory>()
                .HasKey(cc => new { cc.ComicId, cc.CategoryId });

            modelBuilder.Entity<ComicCategory>()
                .HasOne(cc => cc.Comic)
                .WithMany(c => c.ComicCategories)
                .HasForeignKey(cc => cc.ComicId);

            modelBuilder.Entity<ComicCategory>()
                .HasOne(cc => cc.Category)
                .WithMany(cat => cat.ComicCategories)
                .HasForeignKey(cc => cc.CategoryId);

            // Unique Bookmark Constraint per User and Comic
            modelBuilder.Entity<Bookmark>()
                .HasIndex(b => new { b.UserId, b.ComicId })
                .IsUnique();

            modelBuilder.Entity<Bookmark>()
                .HasOne(b => b.Comic)
                .WithMany(c => c.Bookmarks)
                .HasForeignKey(b => b.ComicId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Bookmark>()
                .HasOne(b => b.User)
                .WithMany(u => u.Bookmarks)
                .HasForeignKey(b => b.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Unique CommentLike Constraint per User and Comment
            modelBuilder.Entity<CommentLike>()
                .HasIndex(cl => new { cl.UserId, cl.CommentId })
                .IsUnique();

            modelBuilder.Entity<CommentLike>()
                .HasOne(cl => cl.Comment)
                .WithMany(c => c.Likes)
                .HasForeignKey(cl => cl.CommentId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<CommentLike>()
                .HasOne(cl => cl.User)
                .WithMany()
                .HasForeignKey(cl => cl.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            // ReadingHistory Relationships (Prevent SQL Server multiple cascade path cycle)
            modelBuilder.Entity<ReadingHistory>()
                .HasOne(rh => rh.Comic)
                .WithMany(c => c.ReadingHistories)
                .HasForeignKey(rh => rh.ComicId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<ReadingHistory>()
                .HasOne(rh => rh.Chapter)
                .WithMany()
                .HasForeignKey(rh => rh.ChapterId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ReadingHistory>()
                .HasOne(rh => rh.User)
                .WithMany(u => u.ReadingHistories)
                .HasForeignKey(rh => rh.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Comment Relationships
            modelBuilder.Entity<Comment>()
                .HasOne(c => c.Comic)
                .WithMany(cm => cm.Comments)
                .HasForeignKey(c => c.ComicId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Comment>()
                .HasOne(c => c.Chapter)
                .WithMany()
                .HasForeignKey(c => c.ChapterId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Comment>()
                .HasOne(c => c.User)
                .WithMany(u => u.Comments)
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Comment>()
                .HasOne(c => c.ParentComment)
                .WithMany()
                .HasForeignKey(c => c.ParentCommentId)
                .OnDelete(DeleteBehavior.Restrict);

            // Report Relationships
            modelBuilder.Entity<Report>()
                .HasOne(r => r.Comic)
                .WithMany()
                .HasForeignKey(r => r.ComicId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Report>()
                .HasOne(r => r.Chapter)
                .WithMany()
                .HasForeignKey(r => r.ChapterId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Report>()
                .HasOne(r => r.User)
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            // Unique Indexes for Search & Routing Performance
            modelBuilder.Entity<Comic>().HasIndex(c => c.Slug).IsUnique();
            modelBuilder.Entity<Category>().HasIndex(c => c.Slug).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();

            // High-Volume Query Non-Clustered Indexes
            modelBuilder.Entity<ReadingHistory>().HasIndex(rh => new { rh.UserId, rh.LastReadAt });
            modelBuilder.Entity<ReadingHistory>().HasIndex(rh => new { rh.UserId, rh.ComicId });
            modelBuilder.Entity<Comment>().HasIndex(c => new { c.ComicId, c.CreatedAt });
            modelBuilder.Entity<Chapter>().HasIndex(ch => new { ch.ComicId, ch.ChapterNumber });
            modelBuilder.Entity<Chapter>().HasIndex(ch => new { ch.ComicId, ch.IsPublic, ch.ChapterNumber });
            modelBuilder.Entity<ChapterPage>().HasIndex(cp => new { cp.ChapterId, cp.PageNumber });
            modelBuilder.Entity<Notification>().HasIndex(n => new { n.UserId, n.IsRead, n.CreatedAt });
            modelBuilder.Entity<Comic>().Property(c => c.Rating).HasPrecision(3, 2);
            modelBuilder.Entity<Comic>().HasIndex(c => new { c.IsPublic, c.IsFeatured, c.UpdatedAt });
            modelBuilder.Entity<Comic>().HasIndex(c => new { c.IsPublic, c.UpdatedAt });

            // ComicRating Constraints & Relationships
            modelBuilder.Entity<ComicRating>()
                .HasIndex(cr => new { cr.UserId, cr.ComicId })
                .IsUnique();

            modelBuilder.Entity<ComicRating>()
                .HasOne(cr => cr.User)
                .WithMany(u => u.Ratings)
                .HasForeignKey(cr => cr.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ComicRating>()
                .HasOne(cr => cr.Comic)
                .WithMany(c => c.Ratings)
                .HasForeignKey(cr => cr.ComicId)
                .OnDelete(DeleteBehavior.Cascade);

            // User Gamification Index for Leaderboard
            modelBuilder.Entity<User>().HasIndex(u => u.Exp);
        }
    }
}
