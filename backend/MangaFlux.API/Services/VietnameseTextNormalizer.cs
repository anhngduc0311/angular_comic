using System;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace TruyenKomi.API.Services
{
    public static class VietnameseTextNormalizer
    {
        public static string RemoveDiacritics(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;

            string normalizedString = text.Normalize(NormalizationForm.FormD);
            var stringBuilder = new StringBuilder();

            foreach (var c in normalizedString)
            {
                var unicodeCategory = CharUnicodeInfo.GetUnicodeCategory(c);
                if (unicodeCategory != UnicodeCategory.NonSpacingMark)
                {
                    stringBuilder.Append(c);
                }
            }

            string result = stringBuilder.ToString().Normalize(NormalizationForm.FormC);
            // Replace Vietnamese 'đ' and 'Đ'
            result = result.Replace("đ", "d").Replace("Đ", "d").Replace("Ð", "d");
            
            // Convert to lowercase and normalize spaces
            result = Regex.Replace(result.ToLowerInvariant(), @"\s+", " ").Trim();
            return result;
        }

        public static int ComputeLevenshteinDistance(string s, string t)
        {
            if (string.IsNullOrEmpty(s)) return string.IsNullOrEmpty(t) ? 0 : t.Length;
            if (string.IsNullOrEmpty(t)) return s.Length;

            int n = s.Length;
            int m = t.Length;
            int[,] d = new int[n + 1, m + 1];

            for (int i = 0; i <= n; d[i, 0] = i++) ;
            for (int j = 0; j <= m; d[0, j] = j++) ;

            for (int i = 1; i <= n; i++)
            {
                for (int j = 1; j <= m; j++)
                {
                    int cost = (t[j - 1] == s[i - 1]) ? 0 : 1;
                    d[i, j] = Math.Min(
                        Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                        d[i - 1, j - 1] + cost
                    );
                }
            }
            return d[n, m];
        }

        public static bool IsFuzzyMatch(string source, string target, int maxDistance = 2)
        {
            if (string.IsNullOrWhiteSpace(source) || string.IsNullOrWhiteSpace(target)) return false;

            string normSource = RemoveDiacritics(source);
            string normTarget = RemoveDiacritics(target);

            // Direct substring match
            if (normSource.Contains(normTarget) || normTarget.Contains(normSource))
            {
                return true;
            }

            // Word token match
            var sourceWords = normSource.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var targetWords = normTarget.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);

            int matchedWords = 0;
            foreach (var tWord in targetWords)
            {
                bool wordMatched = false;
                foreach (var sWord in sourceWords)
                {
                    if (sWord.StartsWith(tWord) || tWord.StartsWith(sWord))
                    {
                        wordMatched = true;
                        break;
                    }
                    if (ComputeLevenshteinDistance(sWord, tWord) <= (tWord.Length > 4 ? 2 : 1))
                    {
                        wordMatched = true;
                        break;
                    }
                }
                if (wordMatched) matchedWords++;
            }

            return matchedWords >= (targetWords.Length > 1 ? targetWords.Length - 1 : 1);
        }
    }
}
