# Markdown Rendering Notes

The shared renderer is `src/components/MarkdownContent.tsx`. It is used by submitted feedback, MLC previews, and Agent chat/process views.

## Enabled

- GFM via `remark-gfm`.
- Soft line breaks via `remark-breaks`.
- Math via `remark-math` and `rehype-katex`.

Supported math examples:

```md
Inline math: $\mu$ and $\sigma$.

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2}
$$
```

## Deferred

### Raw HTML

Raw HTML remains disabled. Rendering HTML would require `rehype-raw`, and safe support would also require a carefully maintained `rehype-sanitize` schema. This has limited product value right now and creates unnecessary security and layout risk for user- or agent-provided content.

### Subscript And Superscript

GFM does not define `H~2~O` or `2^10^` syntax, and the current renderer does not add a custom extension for it. The value is low compared with math support, and loose parsing could accidentally transform ordinary text.

Use math when precise notation is needed:

```md
$H_2O$
$2^{10}$
```