import { chromium } from "playwright";
async function crawlWeixin(url) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForSelector("#container-inner", { timeout: 10000 });
        const content = await page.$eval("#container-inner", (el) => el.textContent?.trim());
        console.log("爬取到的内容----------" + content);
    }
    catch (error) {
        console.error("爬取失败", error);
    }
    finally {
        // 关闭浏览器
        await browser.close();
    }
}
crawlWeixin("https://www.scowboy-blog.top/article/9db8d3d7-5f9a-4fad-a143-55cc8c077c51");
