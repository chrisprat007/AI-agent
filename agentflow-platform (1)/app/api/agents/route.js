import { NextResponse } from "next/server"

export async function POST(request) {
  try {
    const { agent, prompt } = await request.json()

    // Replace this with your actual backend API call
    // Example: const response = await fetch('your-backend-url', { ... })

    // Simulate API call for demo
    await new Promise((resolve) => setTimeout(resolve, 2000))

    if (agent === "vscode") {
      return NextResponse.json({
        message: `VS Code Agent executed: "${prompt}". Files searched and code executed successfully!`,
        status: "success",
      })
    } else if (agent === "shopping") {
      return NextResponse.json({
        message: `Shopping Agent will handle: "${prompt}". Feature coming soon!`,
        status: "pending",
      })
    } else {
      return NextResponse.json({
        message: `General Agent received: "${prompt}". Processing...`,
        status: "processing",
      })
    }
  } catch (error) {
    return NextResponse.json({ message: "Error processing request", status: "error" }, { status: 500 })
  }
}
