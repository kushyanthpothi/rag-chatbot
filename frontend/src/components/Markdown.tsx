import { Fragment } from 'react';

/**
 * Lightweight markdown renderer — zero dependencies.
 * Supports: headings, bold (**text**), italic (*text*), strikethrough (~~text~~),
 * inline code (`code`), fenced code blocks, blockquotes, lists (ul/ol),
 * horizontal rules, links, images, and line breaks.
 */

// ── Inline formatting: split on formatting tokens ──

const FM_REGEX = /(\*\*\*.+?\*\*\*|\*\*.+?\*\*|~~.+?~~|\*.+?\*|`[^`]+`|!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)|\[\d+\])/;

function renderInline(text: string, depth = 0): React.ReactNode {
  if (!text || depth > 3) return <span key="">{text}</span>;

  // We do NOT manually escape HTML entities. React's text nodes already
  // safely escape them. We only need to extract `&amp;`, `&lt;` etc. that
  // were pre-escaped by upstream, and unescape those back to their characters
  // so React's JSX can re-escape them properly.
  // This prevents the double-escape bug where `and` becomes `&amp;`.
  const unescaped = text
    .replace(/\&amp;/g, '&')
    .replace(/\&lt;/g, '<')
    .replace(/\&gt;/g, '>')
    .replace(/\&quot;/g, '"');

  const parts = unescaped.split(FM_REGEX);

  return (
    <>
      {parts.map((part, i) => {
        // `code`
        if (/^`(.+?)`$/.test(part)) {
          return <code key={i} className="font-mono">{part.slice(1, -1)}</code>;
        }

        // ***bold italic***
        if (/^\*\*\*(.+)\*\*\*$/.test(part)) {
          return <strong key={i} className="italic">{renderInline(part.slice(3, -3), depth + 1)}</strong>;
        }

        // **bold**
        if (/^\*\*(.+)\*\*$/.test(part)) {
          return <strong key={i}>{renderInline(part.slice(2, -2), depth + 1)}</strong>;
        }

        // ~~strike~~
        if (/^~~(.+)~~$/.test(part)) {
          return <del key={i}>{part.slice(2, -2)}</del>;
        }

        // *italic*
        if (/^\*(.+)\*$/.test(part)) {
          return <em key={i}>{renderInline(part.slice(1, -1), depth + 1)}</em>;
        }

        // [link](url)
        const lm = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (lm) {
          return (
            <a key={i} href={lm[2]} target="_blank" rel="noopener noreferrer"
               className="text-blue-400 underline underline-offset-2 hover:text-blue-300">
              {lm[1]}
            </a>
          );
        }

        // ![alt](url)
        const im = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (im) {
          return <img key={i} src={im[2]} alt={im[1]} className="max-w-full rounded-lg my-1" />;
        }

        // [1] [2] etc. — citation badges
        const cm = part.match(/^\[(\d+)\]$/);
        if (cm) {
          return (
            <sub key={i} className="inline-flex items-center justify-center min-w-[16px] h-[16px]
              mx-[2px] px-[3px] text-[.55rem] font-bold leading-none rounded
              bg-amber-500/15 text-amber-400 border border-amber-500/25
              align-super cursor-default hover:bg-amber-500/25 transition-colors">
              {cm[1]}
            </sub>
          );
        }

        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

// ── Block parser ──

function parseToBlocks(text: string): Array<{ type: string; content: string; lang?: string }> {
  const lines = text.split('\n');
  const blocks: Array<{ type: string; content: string; lang?: string }> = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Code fence
    const fm = line.match(/^```(\w*)\s*/);
    if (fm) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      i++; // skip closing ```
      blocks.push({ type: 'code-block', content: code.join('\n'), lang: fm[1] });
      continue;
    }

    // Headings
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      blocks.push({ type: `h${hm[1].length}`, content: hm[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3}|\*{3}|_{3})$/.test(line.trim())) {
      i++;
      blocks.push({ type: 'hr', content: '' });
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const bq: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        bq.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', content: bq.join('\n') });
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().match(/^[-*] /) || lines[i].trim() === '')) {
        if (lines[i].trim().match(/^[-*] /)) {
          const subMatch = lines[i].trim().match(/^[-*]\s(.*)/);
          if (subMatch) items.push(subMatch[1]);
        }
        i++;
      }
      blocks.push({ type: 'ul', content: items.join('\n') });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().match(/^\d+\.\s/) || lines[i].trim() === '')) {
        const subMatch = lines[i].trim().match(/^\d+\.\s(.*)/);
        if (subMatch) items.push(subMatch[1]);
        i++;
      }
      blocks.push({ type: 'ol', content: items.join('\n') });
      continue;
    }

    // Paragraph — consume consecutive non-special, non-blank lines
    const para: string[] = [];
    while (i < lines.length
      && lines[i].trim() !== ''
      && !/^(#{1,6})\s+/.test(lines[i])
      && !/^-{3}$/.test(lines[i].trim())
      && !/^\*{3}$/.test(lines[i].trim())
      && !lines[i].trim().startsWith('```')
      && !lines[i].trim().startsWith('>')
      && !/^[-*] /.test(lines[i].trim())
      && !/^\d+\.\s/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length > 0) {
      blocks.push({ type: 'p', content: para.join('\n') });
    }
  }

  return blocks;
}

// ── Main component ──

export default function Markdown({ text }: { text: string }) {
  if (!text) return null;

  const blocks = parseToBlocks(text);

  return (
    <div className="space-y-2.5 text-stone-300">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h1': return <h1 key={i} className="text-base font-semibold text-white">{renderInline(b.content)}</h1>;
          case 'h2': return <h2 key={i} className="text-sm font-semibold text-white">{renderInline(b.content)}</h2>;
          case 'h3': return <h3 key={i} className="text-sm font-medium text-stone-200">{renderInline(b.content)}</h3>;
          case 'h4': return <h4 key={i} className="text-xs font-medium text-stone-300">{renderInline(b.content)}</h4>;
          case 'h5': return <h5 key={i} className="text-xs font-medium text-stone-400">{renderInline(b.content)}</h5>;
          case 'h6': return <h6 key={i} className="text-xs text-stone-500">{renderInline(b.content)}</h6>;

          case 'p': {
            // Split by double newlines = paragraphs; single newlines = <br/>
            const subParas = b.content.split(/\n{2,}/);
            return (
              <div key={i} className="text-[.82rem] leading-relaxed">
                {subParas.map((sp, j) => (
                  <p key={j} className={j > 0 ? 'mt-2' : ''}>
                    {sp.split('\n').map((seg, k) => (
                      <Fragment key={k}>
                        {k > 0 && <br />}
                        {renderInline(seg)}
                      </Fragment>
                    ))}
                  </p>
                ))}
              </div>
            );
          }

          case 'code-block':
            return (
              <pre key={i} className="bg-black/30 border border-stone-800/40 rounded-lg p-3 overflow-x-auto text-xs my-2">
                <code className="font-mono text-stone-300">{b.content}</code>
              </pre>
            );

          case 'blockquote':
            return (
              <blockquote key={i} className="border-l-2 border-stone-700/60 pl-3 py-1 my-1 text-[.78rem] text-stone-400 italic">
                {b.content.split('\n').map((seg, k) => (
                  <Fragment key={k}>
                    {k > 0 && <br />}
                    {renderInline(seg)}
                  </Fragment>
                ))}
              </blockquote>
            );

          case 'hr':
            return <hr key={i} className="border-stone-800/40 my-2" />;

          case 'ul':
            return (
              <ul key={i} className="list-disc pl-5 space-y-0.5">
                {b.content.split('\n').map((item, j) => (
                  <li key={j} className="text-[.78rem] text-stone-300">{renderInline(item)}</li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol key={i} className="list-decimal pl-5 space-y-0.5">
                {b.content.split('\n').map((item, j) => (
                  <li key={j} className="text-[.78rem] text-stone-300">{renderInline(item)}</li>
                ))}
              </ol>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
