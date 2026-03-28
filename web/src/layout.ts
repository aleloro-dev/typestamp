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
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
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
                <a class="primary" href="https://chromewebstore.google.com/detail/typestamp/eiijgknnafpmcoijmjecdofajojfielb" target="_blank" rel="noopener noreferrer">Get the extension</a>
            </div>
        </div>
        ${body}
        <footer class="site-footer">
            <div class="footer-links">
                ${footerCta ? `<a href="/">Create a typestamp</a>` : ""}
                ${footerRef ? `<a href="/ref">Create a reference</a>` : ""}
                <a href="/about">How it works</a>
                <a href="/use-cases">Use cases</a>
                <a href="/interpret">How to interpret a typestamp</a>
            </div>
            <div class="footer-right">
                <a class="contact-btn" href="mailto:hi@typestamp.com">Contact</a>
                <a href="https://github.com/aleloro-dev/typestamp" target="_blank" rel="noopener noreferrer">Github</a>
                <a href="/privacy">Privacy</a>
            </div>
        </footer>
    </body>
</html>`;
}
