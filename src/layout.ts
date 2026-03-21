export interface NavLink {
  href: string;
  text: string;
  id?: string;
}

export async function layout(
  title: string,
  nav: NavLink[],
  body: string,
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
    </head>
    <body>
        <div class="header">
            <a href="/">Typestamp</a>
            ${
              nav.length > 0
                ? `<div class="nav">
            ${navHtml}
        </div>`
                : ""
            }
        </div>
        ${body}
    </body>
</html>`;
}
