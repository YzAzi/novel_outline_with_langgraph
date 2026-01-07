import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function StoryVisualizer() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>大纲视图</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        这里将展示故事节点的可视化布局。
      </CardContent>
    </Card>
  )
}
