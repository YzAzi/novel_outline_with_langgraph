import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function NodeEditor() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>节点编辑</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        选择一个节点后，在这里编辑剧情与角色信息。
      </CardContent>
    </Card>
  )
}
