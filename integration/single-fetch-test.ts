import { test, expect } from "@playwright/test";

import {
  createAppFixture,
  createFixture,
  js,
} from "./helpers/create-fixture.js";
import { PlaywrightFixture } from "./helpers/playwright-fixture.js";
import { ServerMode } from "../build/node_modules/@remix-run/server-runtime/dist/mode.js";

const ISO_DATE = "2024-03-12T12:00:00.000Z";

const files = {
  "app/root.tsx": js`
    import { Form, Link, Links, Meta, Outlet, Scripts } from "@remix-run/react";

    export function loader() {
      return {
        message: "ROOT",
      };
    }

    export default function Root() {
      return (
        <html lang="en">
          <head>
            <Meta />
            <Links />
          </head>
          <body>
            <Link to="/">Home</Link><br/>
            <Link to="/data">Data</Link><br/>
            <Form method="post" action="/data">
              <button type="submit" name="key" value="value">
                Submit
              </button>
            </Form>
            <Outlet />
            <Scripts />
          </body>
        </html>
      );
    }
  `,

  "app/routes/_index.tsx": js`
    export default function Index() {
      return <h1>Index</h1>
    }
  `,

  "app/routes/data.tsx": js`
    import { useActionData, useLoaderData } from "@remix-run/react";

    export async function action({ request }) {
      let formData = await request.formData();
      return {
        key: formData.get('key'),
      };
    }

    export function loader({ request }) {
      if (new URL(request.url).searchParams.has("error")) {
        throw new Error("Loader Error");
      }
      return {
        message: "DATA",
        date: new Date("${ISO_DATE}"),
      };
    }

    export default function Index() {
      let data = useLoaderData();
      let actionData = useActionData();
      return (
        <>
          <h1 id="heading">Data</h1>
          <p id="message">{data.message}</p>
          <p id="date">{data.date.toISOString()}</p>
          {actionData ? <p id="action-data">{actionData.key}</p> : null}
        </>
      )
    }
  `,
};

test.describe("single-fetch", () => {
  test("loads proper data on single fetch loader requests", async () => {
    let fixture = await createFixture(
      {
        config: {
          future: {
            unstable_singleFetch: true,
          },
        },
        files,
      },
      ServerMode.Development
    );
    let res = await fixture.requestSingleFetchData("/_root.data");
    expect(res.data).toEqual({
      root: {
        data: {
          message: "ROOT",
        },
      },
      "routes/_index": {
        data: null,
      },
    });

    res = await fixture.requestSingleFetchData("/data.data");
    expect(res.data).toEqual({
      root: {
        data: {
          message: "ROOT",
        },
      },
      "routes/data": {
        data: {
          message: "DATA",
          date: new Date(ISO_DATE),
        },
      },
    });
  });

  test("loads proper errors on single fetch loader requests", async () => {
    let fixture = await createFixture(
      {
        config: {
          future: {
            unstable_singleFetch: true,
          },
        },
        files,
      },
      ServerMode.Development
    );

    let res = await fixture.requestSingleFetchData("/data.data?error=true");
    expect(res.data).toEqual({
      root: {
        data: {
          message: "ROOT",
        },
      },
      "routes/data": {
        error: new Error("Loader Error"),
      },
    });
  });

  test("loads proper data on single fetch action requests", async () => {
    let fixture = await createFixture(
      {
        config: {
          future: {
            unstable_singleFetch: true,
          },
        },
        files,
      },
      ServerMode.Development
    );
    let postBody = new URLSearchParams();
    postBody.set("key", "value");
    let res = await fixture.requestSingleFetchData("/data.data", {
      method: "post",
      body: postBody,
    });
    expect(res.data).toEqual({
      data: {
        key: "value",
      },
    });
  });

  test("loads proper data on document request", async ({ page }) => {
    let fixture = await createFixture({
      config: {
        future: {
          unstable_singleFetch: true,
        },
      },
      files,
    });
    let appFixture = await createAppFixture(fixture);
    let app = new PlaywrightFixture(appFixture, page);
    await app.goto("/data");
    expect(await app.getHtml("#heading")).toContain("Data");
    expect(await app.getHtml("#message")).toContain("DATA");
    expect(await app.getHtml("#date")).toContain(ISO_DATE);
  });

  test("loads proper data on client side navigation", async ({ page }) => {
    let fixture = await createFixture({
      config: {
        future: {
          unstable_singleFetch: true,
        },
      },
      files,
    });
    let appFixture = await createAppFixture(fixture);
    let app = new PlaywrightFixture(appFixture, page);
    await app.goto("/");
    await app.clickLink("/data");
    await page.waitForSelector("#message");
    expect(await app.getHtml("#heading")).toContain("Data");
    expect(await app.getHtml("#message")).toContain("DATA");
    expect(await app.getHtml("#date")).toContain(ISO_DATE);
  });

  test("loads proper data on client side action navigation", async ({
    page,
  }) => {
    let fixture = await createFixture({
      config: {
        future: {
          unstable_singleFetch: true,
        },
      },
      files,
    });
    let appFixture = await createAppFixture(fixture);
    let app = new PlaywrightFixture(appFixture, page);
    await app.goto("/");
    await app.clickSubmitButton("/data");
    await page.waitForSelector("#message");
    expect(await app.getHtml("#heading")).toContain("Data");
    expect(await app.getHtml("#message")).toContain("DATA");
    expect(await app.getHtml("#date")).toContain(ISO_DATE);
    expect(await app.getHtml("#action-data")).toContain("value");
  });

  test("allows fine-grained revalidation", async ({ page }) => {
    let fixture = await createFixture({
      config: {
        future: {
          unstable_singleFetch: true,
        },
      },
      files: {
        ...files,
        "app/routes/no-revalidate.tsx": js`
          import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';

          export async function action({ request }) {
            let fd = await request.formData();
            return { shouldRevalidate: fd.get('revalidate') === "yes" }
          }

          let count = 0;
          export function loader() {
            return { count: ++count };
          }

          export default function Comp() {
            let navigation = useNavigation();
            let data = useLoaderData();
            let actionData = useActionData();
            return (
              <Form method="post">
                <button type="submit" name="revalidate" value="yes">Submit w/Revalidation</button>
                <button type="submit" name="revalidate" value="no">Submit w/o Revalidation</button>
                <p id="data">{data.count}</p>
                {navigation.state === "idle" ? <p id="idle">idle</p> : null}
                {actionData ? <p id="action-data">yes</p> : null}
              </Form>
            );
          }

          export function shouldRevalidate({ actionResult }) {
            return actionResult.shouldRevalidate === true;
          }
        `,
      },
    });

    let urls: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "GET" && req.url().includes(".data")) {
        urls.push(req.url());
      }
    });

    let appFixture = await createAppFixture(fixture);
    let app = new PlaywrightFixture(appFixture, page);
    await app.goto("/no-revalidate");
    expect(await app.getHtml("#data")).toContain("1");
    expect(urls).toEqual([]);

    await page.click('button[name="revalidate"][value="yes"]');
    await page.waitForSelector("#action-data");
    await page.waitForSelector("#idle");
    expect(await app.getHtml("#data")).toContain("2");
    expect(urls).toEqual([expect.stringMatching(/\/no-revalidate\.data$/)]);

    await page.click('button[name="revalidate"][value="no"]');
    await page.waitForSelector("#action-data");
    await page.waitForSelector("#idle");
    expect(await app.getHtml("#data")).toContain("2");
    expect(urls).toEqual([
      expect.stringMatching(/\/no-revalidate\.data$/),
      expect.stringMatching(/\/no-revalidate\.data\?_routes=root$/),
    ]);
  });

  test("does not revalidate on 4xx/5xx action responses", async ({ page }) => {
    let fixture = await createFixture({
      config: {
        future: {
          unstable_singleFetch: true,
        },
      },
      files: {
        ...files,
        "app/routes/action.tsx": js`
          import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react';

          export async function action({ request }) {
            let fd = await request.formData();
            if (fd.get('throw') === "5xx") {
              throw new Response("Thrown 500", { status: 500 });
            }
            if (fd.get('throw') === "4xx") {
              throw new Response("Thrown 400", { status: 400 });
            }
            if (fd.get('return') === "5xx") {
              return new Response("Returned 500", { status: 500 });
            }
            if (fd.get('return') === "4xx") {
              return new Response("Returned 400", { status: 400 });
            }
            return null;
          }

          let count = 0;
          export function loader() {
            return { count: ++count };
          }

          export default function Comp() {
            let navigation = useNavigation();
            let data = useLoaderData();
            return (
              <Form method="post">
                <button type="submit" name="throw" value="5xx">Throw 5x</button>
                <button type="submit" name="throw" value="4xx">Throw 4xx</button>
                <button type="submit" name="return" value="5xx">Return 5xx</button>
                <button type="submit" name="return" value="4xx">Return 4xx</button>
                <p id="data">{data.count}</p>
                {navigation.state === "idle" ? <p id="idle">idle</p> : null}
              </Form>
            );
          }

          export function ErrorBoundary() {
            return (
              <div>
                <h1 id="error">Error</h1>
                <Link to="/action">Back</Link>
              </div>
            );
          }
        `,
      },
    });

    let urls: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "GET" && req.url().includes(".data")) {
        urls.push(req.url());
      }
    });

    let appFixture = await createAppFixture(fixture);
    let app = new PlaywrightFixture(appFixture, page);
    await app.goto("/action");
    expect(await app.getHtml("#data")).toContain("1");
    expect(urls).toEqual([]);

    await page.click('button[name="return"][value="5xx"]');
    await page.waitForSelector("#idle");
    expect(await app.getHtml("#data")).toContain("1");
    expect(urls).toEqual([]);

    await page.click('button[name="return"][value="4xx"]');
    await page.waitForSelector("#idle");
    expect(await app.getHtml("#data")).toContain("1");
    expect(urls).toEqual([]);

    await page.click('button[name="throw"][value="5xx"]');
    await page.waitForSelector("#error");
    expect(urls).toEqual([]);
    await app.clickLink("/action");
    await page.waitForSelector("#data");
    expect(await app.getHtml("#data")).toContain("2");
    urls = [];

    await page.click('button[name="throw"][value="4xx"]');
    await page.waitForSelector("#error");
    expect(urls).toEqual([]);
  });

  test("returns loader headers through the headers function", async () => {
    let fixture = await createFixture({
      config: {
        future: {
          unstable_singleFetch: true,
        },
      },
      files: {
        ...files,
        "app/routes/headers.tsx": js`
          export function headers({ loaderHeaders }) {
            let headers = new Headers(loaderHeaders);
            headers.set('x-headers-function', 'true')
            return headers;
          }

          export function action({ request }) {
            if (new URL(request.url).searchParams.has("error")) {
              throw new Response(null, { headers: { "x-action-error": "true" } });
            }
            return new Response(null, { headers: { "x-action": "true" } });
          }

          export function loader({ request }) {
            if (new URL(request.url).searchParams.has("error")) {
              throw new Response(null, { headers: { "x-loader-error": "true" } });
            }
            return new Response(null, { headers: { "x-loader": "true" } });
          }

          export default function Comp() {
            return null;
          }
        `,
      },
    });

    let res = await fixture.requestSingleFetchData("/headers.data");
    expect(res.headers.get("x-loader")).toEqual("true");
    expect(res.headers.get("x-headers-function")).toEqual("true");

    res = await fixture.requestSingleFetchData("/headers.data", {
      method: "post",
      body: null,
    });
    expect(res.headers.get("x-action")).toEqual("true");
    expect(res.headers.get("x-headers-function")).toEqual(null);

    res = await fixture.requestSingleFetchData("/headers.data?error");
    expect(res.headers.get("x-loader-error")).toEqual("true");
    expect(res.headers.get("x-headers-function")).toEqual("true");

    res = await fixture.requestSingleFetchData("/headers.data?error", {
      method: "post",
      body: null,
    });
    expect(res.headers.get("x-action-error")).toEqual("true");
    expect(res.headers.get("x-headers-function")).toEqual(null);
  });
});