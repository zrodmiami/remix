import { test, expect } from "@playwright/test";

import { PlaywrightFixture } from "./helpers/playwright-fixture.js";
import type { Fixture, AppFixture } from "./helpers/create-fixture.js";
import {
  createAppFixture,
  createFixture,
  js,
} from "./helpers/create-fixture.js";

let fixture: Fixture;
let appFixture: AppFixture;

test.beforeEach(async ({ context }) => {
  await context.route(/_data/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    route.continue();
  });
});

test.beforeAll(async () => {
  fixture = await createFixture({
    config: {
      future: {
        unstable_alignRouteSignatures: true,
      },
    },
    files: {
      "app/routes/_index.tsx": js`
        import { useActionData, useLoaderData, Form, Link } from "@remix-run/react";

        export function loader(args) {
          return { server: Object.keys(args) };
        }

        export async function clientLoader(args) {
          return {
            ...(await args.serverLoader()),
            client: Object.keys(args),
          };
        }

        export function action(args) {
          return { server: Object.keys(args) };
        }

        export async function clientAction(args) {
          return {
            ...(await args.serverAction()),
            client: Object.keys(args),
          };
        }

        export function headers(args) {
          return new Headers({
            "x-custom": JSON.stringify(Object.keys(args)),
          });
        }

        export function links(args) {
          const url = new URL("test://test.com");
          url.searchParams.set("args", JSON.stringify(Object.keys(args)));
          return [
            { rel: "stylesheet", href: url.href },
          ]
        }

        export function meta(args) {
          return [{ title: JSON.stringify(Object.keys(args)) }];
        }

        export default function Index() {
          let actionData = useActionData();
          let loaderData = useLoaderData();
          return (
            <div>
              {actionData && <pre data-test-id="action">{JSON.stringify(actionData)}</pre>}
              <pre data-test-id="loader">{JSON.stringify(loaderData)}</pre>
              <Form method="post">
                <button data-test-id="submit" type="submit">Submit</button>
              </Form>
            </div>
          )
        }
      `,
    },
  });

  appFixture = await createAppFixture(fixture);
});

test.afterAll(() => {
  appFixture.close();
});

test("route module functions are passed expected arguments", async ({
  page,
}) => {
  let app = new PlaywrightFixture(appFixture, page);
  let response = await fixture.requestDocument("/");
  let headersArgs = JSON.parse(response.headers.get("x-custom")).sort();

  let sharedArgs = ["matches", "params", "request"];
  let sharedServerArgs = [...sharedArgs, "context"].sort();

  expect(headersArgs).toEqual(
    [
      ...sharedServerArgs,
      "actionHeaders",
      "data",
      "error",
      "errorHeaders",
      "loaderData",
      "loaderHeaders",
      "parentHeaders",
    ].sort()
  );

  await app.goto("/");
  await app.clickElement('[data-test-id="submit"]');

  let action = await page.waitForSelector("[data-test-id=action]");
  let loader = await page.waitForSelector("[data-test-id=loader]");
  let actionArgs = JSON.parse(await action.innerText());
  let loaderArgs = JSON.parse(await loader.innerText());

  expect(actionArgs.server.sort()).toEqual(sharedServerArgs);
  expect(actionArgs.client.sort()).toEqual(
    [...sharedArgs, "location", "serverAction"].sort()
  );
  expect(loaderArgs.server.sort()).toEqual(sharedServerArgs);
  expect(loaderArgs.client.sort()).toEqual(
    [...sharedArgs, "location", "serverLoader"].sort()
  );

  let stylesheet = await page.waitForSelector("link[rel=stylesheet]", {
    state: "attached",
  });
  let url = new URL((await stylesheet.getAttribute("href"))!);
  let linksArgs = JSON.parse(url.searchParams.get("args")!).sort();
  expect(linksArgs).toEqual([
    "data",
    "error",
    "loaderData",
    "location",
    "matches",
    "params",
  ]);

  let metaArgs = JSON.parse(await page.title()).sort();
  expect(metaArgs).toEqual([
    "data",
    "error",
    "loaderData",
    "location",
    "matches",
    "params",
    "values",
  ]);
});
