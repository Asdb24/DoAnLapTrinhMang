<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.


- Sử dụng shadcnui đã tích mcp rồi bạn có thể gọi nếu muốn sử dụng các component của shadcnui. Bạn có thể tham khảo tài liệu của shadcnui để biết cách sử dụng các component này.
- Reuseable components: Bạn có thể tạo các component tái sử dụng để giảm thiểu việc viết lại code. Ví dụ, bạn có thể tạo một component Button và sử dụng nó ở nhiều nơi trong ứng dụng.
- Không generic code: Tránh viết code quá generic, hãy viết code cụ thể cho từng trường hợp để dễ dàng bảo trì và nâng cấp.
- Không generic component: Tránh viết các component quá generic, hãy viết các component cụ thể cho từng trường hợp để dễ dàng bảo trì và nâng cấp.
- Không generic function: Tránh viết các function quá generic, hãy viết các function cụ thể cho từng trường hợp để dễ dàng bảo trì và nâng cấp.
- Không generic class: Tránh viết các class quá generic, hãy viết các class cụ thể cho từng trường hợp để dễ dàng bảo trì và nâng cấp.
- Không generic chế cháo lại UI shadcnui sử dụng sát những gì đã gọi từ shadcnui 
- Thiết kế theo chuẩn WCAG: Hãy đảm bảo rằng ứng dụng của bạn tuân thủ các tiêu chuẩn W3C và WCAG 2.0 để đảm bảo rằng nó có thể truy cập được cho tất cả người dùng, bao gồm cả những người có khuyết tật.
- Sử dụng TypeScript: Hãy sử dụng TypeScript để giúp phát hiện lỗi sớm hơn và cải thiện khả năng đọc code.

<!-- END:nextjs-agent-rules -->
