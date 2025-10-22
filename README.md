`index.ts`
```ts
import express from "express";
import cors from "cors";
import { connectMcp, getMcpClient, getTools } from "./mcpClient.js";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { OpenAI } from "openai";
import { Response } from "express";

interface ExtendedDelta extends OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta {
  reasoning_content?: string;
}
interface QwenChatCompletion extends OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
  enable_thinking?: boolean;
}

const openai = new OpenAI({
  apiKey: "xxxx",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

const app = express();
app.use(cors());
app.use(express.json());

const prompt = `
crawlWeChatContent:这是一个可以爬取阅读网页内容的工具，
主要面向百度网页，链接以：https://www.baidu.com/bh开头，
如果用户的需求是获取阅读网页，请调用该工具
`;

const messages: ChatCompletionMessageParam[] = [{ role: "system", content: prompt }];
// 模型回复结果
let aiMessage = "";
app.post("/chat", async (req, res) => {
  // userContent：用户的问题
  const { userContent } = req.body as { userContent: string | undefined };
  console.log(userContent);
  if (!userContent) {
    res.status(400).send("缺少userContent字段");
    throw new Error("缺少userContent字段");
  }
  messages.push({ role: "user", content: userContent });
  try {
    const completion = await openai.chat.completions.create({
      model: "qwen3-235b-a22b",
      messages,
      stream: true,
      tools: getTools(),
    });
    // 存放工具的参数的
    let toolCallArgsStr = "";
    // 工具名称
    let toolName = "";
    for await (const chunk of completion) {
      // console.log("模型输出-------" + JSON.stringify(chunk));
      const chunkObj = chunk.choices;
      const delta = chunk.choices[0].delta as ExtendedDelta;
      // 深度思考
      if (delta.reasoning_content !== undefined && delta.reasoning_content !== null) {
        console.log("深度思考-------");
        console.log(JSON.stringify(chunk));
        // 返回前端
        const result = { type: "deepThinking", content: delta.reasoning_content };
        notifStream(res, result);
      }
      // 最后输出总结
      if (delta.content !== undefined && delta.content) {
        console.log("最后输出总结-------");
        console.log(JSON.stringify(chunk));
        // 返回前端
        const result = { type: "modelSummary", content: delta.content };
        notifStream(res, result);
        aiMessage += delta.content;
      }
      // 触发工具调用
      if (delta.tool_calls && delta.tool_calls[0].function?.arguments) {
        console.log("触发工具调用-------");
        console.log(JSON.stringify(chunk));
        toolCallArgsStr += delta.tool_calls[0].function?.arguments;
      }
      // 获取工具名称
      if (delta.tool_calls && delta.tool_calls[0].function?.name) {
        toolName = delta.tool_calls[0].function?.name;
      }
      // 判断工具输出结束
      if (chunkObj[0].finish_reason === "tool_calls") {
        console.log("工具输出结束-------");
        // 调用mcp获取网页内容
        const mcpRes = await getMcpClient().callTool({
          name: toolName,
          arguments: JSON.parse(toolCallArgsStr), //{url:'https:}
        });
        // console.log("mcp获取网页内容-------" + JSON.stringify(mcpRes));
        // 返回前端
        const result = { type: "mcpContent", content: "mcp工具获取文章内容成功！" };
        notifStream(res, result);
        // 再次调用大模型组合对话
        messages.push({ role: "user", content: mcpRes.content as string });
        const completionb = await openai.chat.completions.create({
          model: "qwen3-235b-a22b",
          messages,
          stream: true,
          enable_thinking: false, //关闭深度思考
        } as QwenChatCompletion);
        for await (const chunkb of completionb) {
          console.log("mcp回复最后内容");
          console.log(JSON.stringify(chunkb));
          // 返回前端
          const result = { type: "modelSummary", content: chunkb.choices[0].delta.content };
          notifStream(res, result);
          aiMessage += chunkb.choices[0].delta.content;
        }
      }
    }
  } catch (error) {
    console.log("调用模型出错");
  } finally {
    console.log("模型回复完毕");
    res.end();
    messages.push({ role: "assistant", content: aiMessage });
  }
});

// 流式输出
function notifStream(stream: Response, streamData: any) {
  stream.write(JSON.stringify({ role: "assistant", ...streamData }) + "###ABC###");
}

app.listen(3500, async () => {
  console.log("客户端接口启动了");
  try {
    await connectMcp();
  } catch (error) {
    console.error("mcp连接失败", error);
  }
});

```



`mcpClient.ts`
```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ChatCompletionTool } from "openai/resources/chat/completions";

const client = new Client({
  name: "mcp-client-qwen",
  version: "1.0.0",
});
// 返回的工具列表
let tools: ChatCompletionTool[] = [];
export async function connectMcp() {
  const mcpUrl = new URL("https://ai.weiniai.cn/mcp/"); //https://ai.weiniai.cn/mcp/
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  await client.connect(transport);
  const toolsRes = await client.listTools();
  tools = toolsRes.tools.map((item) => ({
    type: "function",
    function: {
      name: item.name,
      description: item.description,
      parameters: item.inputSchema,
    },
  }));
  console.log("mcp客户端已经连接到服务器，获取到工具列表---" + JSON.stringify(tools));
}

export function getMcpClient() {
  return client;
}
export function getTools() {
  return tools;
}

```
