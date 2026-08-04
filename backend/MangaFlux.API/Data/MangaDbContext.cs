using Microsoft.EntityFrameworkCore;
using MangaFlux.API.Models;

namespace MangaFlux.API.Data
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

            // Unique CommentLike Constraint per User and Comment
            modelBuilder.Entity<CommentLike>()
                .HasIndex(cl => new { cl.UserId, cl.CommentId })
                .IsUnique();

            // Unique Indexes for Search & Routing Performance
            modelBuilder.Entity<Comic>().HasIndex(c => c.Slug).IsUnique();
            modelBuilder.Entity<Category>().HasIndex(c => c.Slug).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();

            // High-Volume Query Non-Clustered Indexes
            modelBuilder.Entity<ReadingHistory>().HasIndex(rh => new { rh.UserId, rh.LastReadAt });
            modelBuilder.Entity<Comment>().HasIndex(c => new { c.ComicId, c.CreatedAt });
            modelBuilder.Entity<Chapter>().HasIndex(ch => new { ch.ComicId, ch.ChapterNumber });
            modelBuilder.Entity<Notification>().HasIndex(n => new { n.UserId, n.IsRead, n.CreatedAt });
            modelBuilder.Entity<Comic>().HasIndex(c => new { c.IsPublic, c.IsFeatured, c.UpdatedAt });
        }
    }
}
