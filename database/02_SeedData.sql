-- ============================================================================
-- TRUYENKOMI SEED DATA SCRIPT (POSTGRESQL)
-- ============================================================================

-- 1. Insert Categories
INSERT INTO "Categories" ("Name", "Slug", "Description", "ImageUrl") VALUES
('Hành Động', 'hanh-dong', 'Thể loại truyện có nội dung hành động, chiến đấu gay cấn.', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80'),
('Phiêu Lưu', 'phieu-luu', 'Cuộc hành trình khám phá những vùng đất mới lạ.', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80'),
('Chuyển Sinh', 'chuyen-sinh', 'Nhân vật chính đầu thai hoặc xuyên không sang thế giới khác.', 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=400&q=80'),
('Huyền Huyễn', 'huyen-huyen', 'Thế giới tu tiên, phép thuật và sức mạnh siêu nhiên.', 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80'),
('Hài Hước', 'hai-huoc', 'Truyện mang tính chất giải trí, đem lại tiếng cười.', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80'),
('Học Đường', 'hoc-duong', 'Bối cảnh trường học, tình cảm tuổi trẻ.', 'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=400&q=80'),
('Kinh Dị', 'kinh-di', 'Yếu tố rùng rợn, giật gân, bí ẩn.', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80')
ON CONFLICT ("Slug") DO NOTHING;

-- 2. Insert Users (Password: "123456" cho User, "admin123" cho Admin)
INSERT INTO "Users" ("Username", "Email", "PasswordHash", "FullName", "Avatar", "Role", "IsLocked") VALUES
('admin', 'admin@truyenkomi.com', '$2a$11$qRzN2P10w.hD/W/o5uSrmOCM2C67rR.62m/r.m8P03oT2h/p.8.v2', 'Quản Trị Viên', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80', 'Admin', FALSE),
('otaku_master', 'user1@gmail.com', '$2a$11$qRzN2P10w.hD/W/o5uSrmOCM2C67rR.62m/r.m8P03oT2h/p.8.v2', 'Nguyễn Văn A', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80', 'User', FALSE),
('manga_lover', 'user2@gmail.com', '$2a$11$qRzN2P10w.hD/W/o5uSrmOCM2C67rR.62m/r.m8P03oT2h/p.8.v2', 'Trần Thị B', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80', 'User', FALSE)
ON CONFLICT ("Username") DO NOTHING;

-- 3. Insert Comics
INSERT INTO "Comics" ("Title", "Slug", "Description", "CoverImage", "BannerImage", "Author", "OtherNames", "Artist", "Country", "ReleaseYear", "Status", "Views", "Rating", "IsFeatured", "IsPublic") VALUES
('Võ Luyện Đỉnh Phong', 'vo-luyen-dinh-phong', 'Vũ đỉnh là đỉnh cao của võ thuật. Dương Khai là một đệ tử quét rác của Thử Kiếm Các, vô tình có được một cuốn hắc thư bí ẩn, từ đó bước lên con đường võ đạo đỉnh cao.', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80', 'Mạc Mặc', 'Martial Peak', 'Mạc Mặc', 'Trung Quốc', 2018, 'Ongoing', 1250000, 4.9, TRUE, TRUE),
('Solo Leveling - Tôi Thăng Cấp Một Mình', 'solo-leveling', '10 năm trước, sau khi "Cổng" kết nối thế giới thực với thế giới quái vật mở ra, một số người bình thường nhận được sức mạnh săn quái vật trong Cổng. Sung Jin-Woo là thợ săn yếu nhất cấp E.', 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1200&q=80', 'Chugong', 'Na Honjaman Level Up', 'DUBU (REDICE Studio)', 'Hàn Quốc', 2018, 'Completed', 2500000, 5.0, TRUE, TRUE),
('Đại Quản Gia Là Ma Hoàng', 'dai-quan-gia-la-ma-hoang', 'Ma Hoàng Trác Nhất Phàm vì có được di bảo Thượng Cổ Ma Hoàng Cửu U Mật Lục mà bị đồ đệ phản bội hãm hại. Trùng sinh thành một gia nhân nhỏ bé nhà họ Lạc.', 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80', 'Dạ Sào', 'Demon Steward Demonic Emperor', 'Dạ Sào', 'Trung Quốc', 2020, 'Ongoing', 890000, 4.8, TRUE, TRUE),
('Chú Thuật Hồi Chiến (Jujutsu Kaisen)', 'jujutsu-kaisen', 'Itadori Yuji là một học sinh trung học có thể lực phi thường. Cậu nuốt phải ngón tay của Nguyền Vương Sukuna để cứu bạn bè, từ đó bắt đầu hành trình của một Chú thuật sư.', 'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1200&q=80', 'Akutami Gege', 'Jujutsu Kaisen', 'Akutami Gege', 'Nhật Bản', 2018, 'Ongoing', 980000, 4.9, FALSE, TRUE),
('Thợ Săn Tí Hon (Hunter x Hunter)', 'hunter-x-hunter', 'Gon Freecss quyết tâm trở thành một Thợ Săn chuyên nghiệp để tìm lại người cha đã mất tích của mình.', 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1200&q=80', 'Togashi Yoshihiro', 'Hunter x Hunter', 'Togashi Yoshihiro', 'Nhật Bản', 1998, 'Ongoing', 670000, 4.7, FALSE, TRUE)
ON CONFLICT ("Slug") DO NOTHING;

-- 4. Insert ComicCategories
INSERT INTO "ComicCategories" ("ComicId", "CategoryId") VALUES
(1, 1), (1, 4), (1, 3),
(2, 1), (2, 2), (2, 4),
(3, 1), (3, 4), (3, 5),
(4, 1), (4, 4), (4, 7),
(5, 1), (5, 2)
ON CONFLICT DO NOTHING;

-- 5. Insert Chapters
INSERT INTO "Chapters" ("ComicId", "ChapterNumber", "Title", "Views", "IsPublic", "PublishedAt") VALUES
(1, 1.0, 'Chapter 1: Hắc thư bí ẩn', 15000, TRUE, CURRENT_TIMESTAMP),
(1, 2.0, 'Chapter 2: Luyện hóa ma thể', 12000, TRUE, CURRENT_TIMESTAMP),
(1, 3.0, 'Chapter 3: Thí luyện thử kiếm', 11000, TRUE, CURRENT_TIMESTAMP),
(2, 1.0, 'Chapter 1: Thợ săn cấp E', 45000, TRUE, CURRENT_TIMESTAMP),
(2, 2.0, 'Chapter 2: Hầm ngục ngầm', 42000, TRUE, CURRENT_TIMESTAMP),
(3, 1.0, 'Chapter 1: Ma hoàng trùng sinh', 25000, TRUE, CURRENT_TIMESTAMP),
(3, 2.0, 'Chapter 2: Lạc gia nguy kịch', 21000, TRUE, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- 6. Insert ChapterPages
INSERT INTO "ChapterPages" ("ChapterId", "PageNumber", "ImageUrl") VALUES
(1, 1, 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80'),
(1, 2, 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1000&q=80'),
(1, 3, 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1000&q=80'),
(4, 1, 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1000&q=80'),
(4, 2, 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1000&q=80')
ON CONFLICT DO NOTHING;

-- 7. Insert Bookmarks
INSERT INTO "Bookmarks" ("UserId", "ComicId") VALUES
(2, 1),
(2, 2),
(3, 2)
ON CONFLICT DO NOTHING;

-- 8. Insert ReadingHistories
INSERT INTO "ReadingHistories" ("UserId", "ComicId", "ChapterId", "LastReadAt") VALUES
(2, 1, 2, CURRENT_TIMESTAMP - INTERVAL '2 hours'),
(2, 2, 4, CURRENT_TIMESTAMP - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- 9. Insert Comments
INSERT INTO "Comments" ("UserId", "ComicId", "ChapterId", "ParentCommentId", "Content", "IsHidden", "ReportCount") VALUES
(2, 1, 1, NULL, 'Truyện rất hay, main bá đạo!', FALSE, 0),
(3, 2, 4, NULL, 'Siêu phẩm Solo Leveling không bao giờ làm tôi thất vọng.', FALSE, 0),
(2, 2, 4, 2, 'Đồng ý với bác, vẽ quá đẹp!', FALSE, 0)
ON CONFLICT DO NOTHING;

-- 10. Insert CommentLikes
INSERT INTO "CommentLikes" ("UserId", "CommentId") VALUES
(2, 2),
(3, 1)
ON CONFLICT DO NOTHING;

-- 11. Insert Notifications
INSERT INTO "Notifications" ("UserId", "Type", "Title", "Message", "Link", "IsRead") VALUES
(2, 'AdminSystem', 'Chào mừng bạn đến với TruyenKomi', 'Chúc bạn có những giây phút đọc truyện vui vẻ!', '/comics', FALSE),
(3, 'CommentReply', 'Có phản hồi mới về bình luận của bạn', 'Người dùng otaku_master đã trả lời bình luận của bạn.', '/comics/solo-leveling', FALSE)
ON CONFLICT DO NOTHING;

-- 12. Insert Reports
INSERT INTO "Reports" ("ComicId", "ChapterId", "UserId", "ReporterName", "ErrorType", "Description", "Status") VALUES
(1, 1, 2, 'Nguyễn Văn A', 'IMAGE_FAILED', 'Ảnh trang 2 bị lỗi không hiển thị được.', 'Pending')
ON CONFLICT DO NOTHING;
