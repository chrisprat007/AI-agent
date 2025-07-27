"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Code2, ShoppingCart, Bot, Send, Sparkles, Zap } from "lucide-react"

export default function AgentFlowPlatform() {
  const [prompt, setPrompt] = useState("")
  const [selectedAgent, setSelectedAgent] = useState("vscode")
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState("")

  const agents = [
    {
      id: "vscode",
      name: "VS Code Agent",
      description: "Automate VS Code tasks, search files, and run code",
      icon: Code2,
      status: "active",
      color: "bg-blue-500",
    },
    {
      id: "shopping",
      name: "Shopping Agent",
      description: "Find products, compare prices, and make purchases",
      icon: ShoppingCart,
      status: "coming-soon",
      color: "bg-green-500",
    },
    {
      id: "general",
      name: "General Agent",
      description: "Handle general tasks and queries",
      icon: Bot,
      status: "planned",
      color: "bg-purple-500",
    },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!prompt.trim()) return

    setIsLoading(true)
    try {
      // Replace with your actual backend endpoint
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent: selectedAgent,
          prompt: prompt.trim(),
        }),
      })

      const data = await response.json()
      setResponse(data.message || "Task completed successfully!")
    } catch (error) {
      setResponse("Error: Failed to process request")
    } finally {
      setIsLoading(false)
    }
  }

  const selectedAgentData = agents.find((agent) => agent.id === selectedAgent)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  AgentFlow
                </h1>
                <p className="text-sm text-gray-600">AI Agent Automation Platform</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              <Zap className="w-3 h-3 mr-1" />
              Live
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Welcome Section */}
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold text-gray-900">Automate Your Workflow with AI Agents</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Choose an agent, describe your task, and watch as AI handles the automation for you.
            </p>
          </div>

          {/* Agent Selection */}
          <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bot className="w-5 h-5" />
                <span>Select Your Agent</span>
              </CardTitle>
              <CardDescription>Choose the AI agent that best fits your automation needs</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedAgent} onValueChange={setSelectedAgent} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  {agents.map((agent) => (
                    <TabsTrigger
                      key={agent.id}
                      value={agent.id}
                      className="flex items-center space-x-2"
                      disabled={agent.status !== "active"}
                    >
                      <agent.icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{agent.name}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {agents.map((agent) => (
                  <TabsContent key={agent.id} value={agent.id}>
                    <div className="flex items-start space-x-4 p-4 rounded-lg bg-gradient-to-r from-gray-50 to-gray-100">
                      <div className={`w-12 h-12 ${agent.color} rounded-lg flex items-center justify-center`}>
                        <agent.icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-lg font-semibold">{agent.name}</h3>
                          <Badge
                            variant={agent.status === "active" ? "default" : "secondary"}
                            className={agent.status === "active" ? "bg-green-500" : ""}
                          >
                            {agent.status === "active"
                              ? "Ready"
                              : agent.status === "coming-soon"
                                ? "Coming Soon"
                                : "Planned"}
                          </Badge>
                        </div>
                        <p className="text-gray-600">{agent.description}</p>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          {/* Prompt Input */}
          <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Describe Your Task</CardTitle>
              <CardDescription>Tell the {selectedAgentData?.name} what you want to automate</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Textarea
                  placeholder={
                    selectedAgent === "vscode"
                      ? "e.g., Find the main.py file and run it, or search for all React components in the src folder"
                      : selectedAgent === "shopping"
                        ? "e.g., Find the best laptop under $1000 with good reviews"
                        : "Describe what you want the agent to do..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[120px] resize-none"
                  disabled={selectedAgentData?.status !== "active"}
                />
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  disabled={!prompt.trim() || isLoading || selectedAgentData?.status !== "active"}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Execute Task
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Response */}
          {response && (
            <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-green-600">Agent Response</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-green-800">{response}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card className="border-0 shadow-md bg-white/60 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <Code2 className="w-12 h-12 mx-auto mb-4 text-blue-600" />
                <h3 className="font-semibold mb-2">VS Code Automation</h3>
                <p className="text-sm text-gray-600">
                  Automatically search files, run code, and manage your development workflow
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-white/60 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-green-600" />
                <h3 className="font-semibold mb-2">Smart Shopping</h3>
                <p className="text-sm text-gray-600">
                  Find products, compare prices, and automate your shopping decisions
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-white/60 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-600" />
                <h3 className="font-semibold mb-2">AI-Powered</h3>
                <p className="text-sm text-gray-600">
                  Advanced AI agents that understand context and execute complex tasks
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
