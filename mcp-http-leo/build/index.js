import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { chromium } from "playwright";
import experss from "express";
const server = new McpServer({
    name: "mcp-server-wx",
    version: "1.0.0",
});
server.tool("crawlWeChatContent", "爬取获取网页内容", {
    url: z.string().url().describe("需要爬取的网页链接"),
}, async ({ url }) => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForSelector("#container-inner", { timeout: 10000 });
        const content = await page.$eval("#container-inner", (el) => el.textContent?.trim());
        const weixinText = content ? content : "没有爬取到网页数据";
        return {
            content: [
                {
                    type: "text",
                    text: weixinText,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: "爬取网页失败了",
                },
            ],
        };
    }
    finally {
        // 关闭浏览器
        await browser.close();
    }
});
const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
});
await server.connect(transport);
const app = experss();
app.post("/weixin", (req, res) => {
    transport.handleRequest(req, res).catch(console.error);
});
app.listen(7800, () => {
    console.log("mcp服务启动成功，端口是7800");
});
