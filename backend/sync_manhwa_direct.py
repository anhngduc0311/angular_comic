#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
⚡ Fast ZetTruyen Manhwa & Manhua Direct API Synchronizer
=============================================================================
Author: TruyenKomi Team
Description: Tương thích ngược với các lệnh cũ và liên kết tới sync_zet_direct.
=============================================================================
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_zet_direct import ZetDirectSync, main

class ZetManhwaDirectSync(ZetDirectSync):
    """Lớp kế thừa tương thích ngược"""
    def sync_category_manhwa(self, start_page: int = 1, max_pages: int = None, max_comics: int = None):
        return self.sync_category(category_slug="manhwa", start_page=start_page, max_pages=max_pages, max_comics=max_comics)

    def sync_category_manhua(self, start_page: int = 1, max_pages: int = None, max_comics: int = None):
        return self.sync_category(category_slug="manhua", start_page=start_page, max_pages=max_pages, max_comics=max_comics)


if __name__ == "__main__":
    main()
