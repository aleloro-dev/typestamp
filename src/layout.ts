export interface NavLink {
  href: string;
  text: string;
  id?: string;
}

export async function layout(
  title: string,
  nav: NavLink[],
  body: string,
  footerCta = true,
  footerRef = true,
): Promise<string> {
  const css = await Bun.file("public/style.css").text();

  const navHtml = nav
    .map(
      (l) => `<a href="${l.href}"${l.id ? ` id="${l.id}"` : ""}>${l.text}</a>`,
    )
    .join("\n            ");

  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <style>${css}</style>
        <script defer src="https://cloud.umami.is/script.js" data-website-id="374b83cb-ded3-4cf2-9c62-0c89e30f8f47"></script>
    </head>
    <body>
        <div class="header">
        <div class="logo">
         <a href="/">Typestamp</a>
        </div>
            <div class="nav">
                ${navHtml}
                <a href="https://github.com/aleloro-dev/typestamp" target="_blank" rel="noopener noreferrer">Github</a>
            </div>
        </div>
        ${body}
        <footer class="site-footer">
            <div class="footer-links">
                ${footerCta ? `<a href="/">Create a proof</a>` : ""}
                ${footerRef ? `<a href="/ref">Create a reference</a>` : ""}
                <a href="/use-cases">Use cases</a>
                <a href="/proofs/interpret">How to interpret a proof</a>
            </div>
            <a class="contact-btn" href="mailto:hi@typestamp.com">Contact</a>
        </footer>
    </body>
</html>`;
}
