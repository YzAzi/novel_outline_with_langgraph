"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function CreateDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>新建大纲</Button>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>新建大纲</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">项目标题</p>
                <Input placeholder="输入项目名称" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">世界观</p>
                <Textarea placeholder="描述世界观设定" rows={3} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">用户需求</p>
                <Textarea placeholder="输入故事起始需求" rows={3} />
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={() => setOpen(false)}>生成</Button>
            </CardFooter>
          </Card>
        </div>
      ) : null}
    </>
  )
}
