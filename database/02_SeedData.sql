-- ============================================================================
-- TRUYENKOMI SEED DATA SCRIPT (SQL SERVER)
-- ============================================================================

USE TruyenKomiDb;
GO

-- 1. Insert Categories
INSERT INTO Categories (Name, Slug, Description, ImageUrl) VALUES
(N'Hành Động', 'hanh-dong', N'Thể loại truyện có nội dung hành động, chiến đấu gay cấn.', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80'),
(N'Phiêu Lưu', 'phieu-luu', N'Cuộc hành trình khám phá những vùng đất mới lạ.', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80'),
(N'Chuyển Sinh', 'chuyen-sinh', N'Nhân vật chính đầu thai hoặc xuyên không sang thế giới khác.', 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=400&q=80'),
(N'Huyền Huyễn', 'huyen-huyen', N'Thế giới tu tiên, phép thuật và sức mạnh siêu nhiên.', 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80'),
(N'Hài Hước', 'hai-huoc', N'Truyện mang tính chất giải trí, đem lại tiếng cười.', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80'),
(N'Học Đường', 'hoc-duong', N'Bối cảnh trường học, tình cảm tuổi trẻ.', 'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=400&q=80'),
(N'Kinh Dị', 'kinh-di', N'Yếu tố rùng rợn, giật gân, bí ẩn.', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80');
GO

-- 2. Insert Users (Password: "123456" cho User, "admin123" cho Admin)
INSERT INTO Users (Username, Email, PasswordHash, FullName, Avatar, Role, IsLocked) VALUES
('admin', 'admin@truyenkomi.com', '$2a$11$qRzN2P10w.hD/W/o5uSrmOCM2C67rR.62m/r.m8P03oT2h/p.8.v2', N'Quản Trị Viên', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80', 'Admin', 0),
('otaku_master', 'user1@gmail.com', '$2a$11$qRzN2P10w.hD/W/o5uSrmOCM2C67rR.62m/r.m8P03oT2h/p.8.v2', N'Nguyễn Văn A', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80', 'User', 0),
('manga_lover', 'user2@gmail.com', '$2a$11$qRzN2P10w.hD/W/o5uSrmOCM2C67rR.62m/r.m8P03oT2h/p.8.v2', N'Trần Thị B', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80', 'User', 0);
GO

-- 3. Insert Comics
INSERT INTO Comics (Title, Slug, Description, CoverImage, BannerImage, Author, OtherNames, Artist, Country, ReleaseYear, Status, Views, Rating, IsFeatured, IsPublic) VALUES
(N'Võ Luyện Đỉnh Phong', 'vo-luyen-dinh-phong', N'Vũ đỉnh là đỉnh cao của võ thuật. Dương Khai là một đệ tử quét rác của Thử Kiếm Các, vô tình có được một cuốn hắc thư bí ẩn, từ đó bước lên con đường võ đạo đỉnh cao.', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80', N'Mạc Mặc', N'Martial Peak', N'Mạc Mặc', N'Trung Quốc', 2018, 'Ongoing', 1250000, 4.9, 1, 1),
(N'Solo Leveling - Tôi Thăng Cấp Một Mình', 'solo-leveling', N'10 năm trước, sau khi "Cổng" kết nối thế giới thực với thế giới quái vật mở ra, một số người bình thường nhận được sức mạnh săn quái vật trong Cổng. Sung Jin-Woo là thợ săn yếu nhất cấp E.', 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1200&q=80', N'Chugong', N'Na Honjaman Level Up', N'DUBU (REDICE Studio)', N'Hàn Quốc', 2018, 'Completed', 2500000, 5.0, 1, 1),
(N'Đại Quản Gia Là Ma Hoàng', 'dai-quan-gia-la-ma-hoang', N'Ma Hoàng Trác Nhất Phàm vì có được di bảo Thượng Cổ Ma Hoàng Cửu U Mật Lục mà bị đồ đệ phản bội hãm hại. Trùng sinh thành một gia nhân nhỏ bé nhà họ Lạc.', 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80', N'Dạ Sào', N'Demon Steward Demonic Emperor', N'Dạ Sào', N'Trung Quốc', 2020, 'Ongoing', 890000, 4.8, 1, 1),
(N'Chú Thuật Hồi Chiến (Jujutsu Kaisen)', 'jujutsu-kaisen', N'Itadori Yuji là một học sinh trung học có thể lực phi thường. Cậu nuốt phải ngón tay của Nguyền Vương Sukuna để cứu bạn bè, từ đó bắt đầu hành trình của một Chú thuật sư.', 'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1200&q=80', N'Akutami Gege', N'Jujutsu Kaisen', N'Akutami Gege', N'Nhật Bản', 2018, 'Ongoing', 980000, 4.9, 0, 1),
(N'Thợ Săn Tí Hon (Hunter x Hunter)', 'hunter-x-hunter', N'Gon Freecss quyết tâm trở thành một Thợ Săn chuyên nghiệp để tìm lại người cha đã mất tích của mình.', 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1200&q=80', N'Togashi Yoshihiro', N'Hunter x Hunter', N'Togashi Yoshihiro', N'Nhật Bản', 1998, 'Ongoing', 670000, 4.7, 0, 1);
GO

-- 4. Insert ComicCategories
INSERT INTO ComicCategories (ComicId, CategoryId) VALUES
(1, 1), (1, 4), (1, 3), -- Vo Luyen Dinh Phong: Hanh Dong, Huyen Huyen, Chuyen Sinh
(2, 1), (2, 2), (2, 4), -- Solo Leveling: Hanh Dong, Phieu Luu, Huyen Huyen
(3, 1), (3, 4), (3, 5), -- Dai Quan Gia: Hanh Dong, Huyen Huyen, Hai Huoc
(4, 1), (4, 4), (4, 7), -- Jujutsu Kaisen: Hanh Dong, Huyen Huyen, Kinh Di
(5, 1), (5, 2);        -- Hunter x Hunter: Hanh Dong, Phieu Luu
GO

-- 5. Insert Chapters
INSERT INTO Chapters (ComicId, ChapterNumber, Title, Views, IsPublic, PublishedAt) VALUES
(1, 1.0, N'Chapter 1: Hắc thư bí ẩn', 15000, 1, GETDATE()),
(1, 2.0, N'Chapter 2: Luyện hóa ma thể', 12000, 1, GETDATE()),
(1, 3.0, N'Chapter 3: Thí luyện thử kiếm', 11000, 1, GETDATE()),
(2, 1.0, N'Chapter 1: Thợ săn cấp E', 45000, 1, GETDATE()),
(2, 2.0, N'Chapter 2: Hầm ngục ngầm', 42000, 1, GETDATE()),
(3, 1.0, N'Chapter 1: Ma hoàng trùng sinh', 25000, 1, GETDATE()),
(3, 2.0, N'Chapter 2: Lạc gia nguy kịch', 21000, 1, GETDATE());
GO

-- 6. Insert ChapterPages
INSERT INTO ChapterPages (ChapterId, PageNumber, ImageUrl) VALUES
(1, 1, 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80'),
(1, 2, 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1000&q=80'),
(1, 3, 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1000&q=80'),
(4, 1, 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1000&q=80'),
(4, 2, 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1000&q=80');
GO

-- 7. Insert Bookmarks
INSERT INTO Bookmarks (UserId, ComicId) VALUES
(2, 1),
(2, 2),
(3, 2);
GO

-- 8. Insert ReadingHistories
INSERT INTO ReadingHistories (UserId, ComicId, ChapterId, LastReadAt) VALUES
(2, 1, 2, DATEADD(hour, -2, GETDATE())),
(2, 2, 4, DATEADD(day, -1, GETDATE()));
GO

-- 9. Insert Comments
INSERT INTO Comments (UserId, ComicId, ChapterId, ParentCommentId, Content, IsHidden, ReportCount) VALUES
(2, 1, 1, NULL, N'Truyện rất hay, main bá đạo!', 0, 0),
(3, 2, 4, NULL, N'Siêu phẩm Solo Leveling không bao giờ làm tôi thất vọng.', 0, 0),
(2, 2, 4, 2, N'Đồng ý với bác, vẽ quá đẹp!', 0, 0);
GO

-- 10. Insert CommentLikes
INSERT INTO CommentLikes (UserId, CommentId) VALUES
(2, 2),
(3, 1);
GO

-- 11. Insert Notifications
INSERT INTO Notifications (UserId, Type, Title, Message, Link, IsRead) VALUES
(2, 'AdminSystem', N'Chào mừng bạn đến với TruyenKomi', N'Chúc bạn có những giây phút đọc truyện vui vẻ!', '/comics', 0),
(3, 'CommentReply', N'Có phản hồi mới về bình luận của bạn', N'Người dùng otaku_master đã trả lời bình luận của bạn.', '/comics/solo-leveling', 0);
GO

-- 12. Insert Reports
INSERT INTO Reports (ComicId, ChapterId, UserId, ReporterName, ErrorType, Description, Status) VALUES
(1, 1, 2, N'Nguyễn Văn A', 'IMAGE_FAILED', N'Ảnh trang 2 bị lỗi không hiển thị được.', 'Pending');
GO
