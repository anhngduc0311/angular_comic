using System;
using System.Net;
using System.Text.RegularExpressions;

namespace TruyenKomi.API.Services
{
    public static class InputSanitizer
    {
        private static readonly Regex HtmlTagRegex = new(@"<[^>]*>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex ScriptTagRegex = new(@"<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex EventAttributeRegex = new(@"\bon\w+\s*=\s*(?:""[^""]*""|'[^']*'|[^\s>]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly Regex JavascriptUrlRegex = new(@"javascript\s*:\s*[^\s""'>]+", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        /// <summary>
        /// Strips all HTML tags and potentially dangerous javascript/event handlers, returning clean plain text.
        /// </summary>
        public static string SanitizePlainText(string? input)
        {
            if (string.IsNullOrWhiteSpace(input)) return string.Empty;

            var sanitized = input;

            // Remove script blocks entirely
            sanitized = ScriptTagRegex.Replace(sanitized, string.Empty);

            // Remove all other HTML tags
            sanitized = HtmlTagRegex.Replace(sanitized, string.Empty);

            // Strip javascript: links
            sanitized = JavascriptUrlRegex.Replace(sanitized, string.Empty);

            // Decode and re-strip in case of double-encoded payload
            var decoded = WebUtility.HtmlDecode(sanitized);
            if (decoded != sanitized)
            {
                sanitized = HtmlTagRegex.Replace(decoded, string.Empty);
            }

            return sanitized.Trim();
        }

        /// <summary>
        /// Sanitizes text allowing safe basic markdown or safe text, removing script/event injection.
        /// </summary>
        public static string SanitizeComment(string? input)
        {
            if (string.IsNullOrWhiteSpace(input)) return string.Empty;

            // For manga comments, strip dangerous tags while keeping plain text and spoiler tags [spoil]...[/spoil]
            var text = SanitizePlainText(input);
            return text;
        }
    }
}
