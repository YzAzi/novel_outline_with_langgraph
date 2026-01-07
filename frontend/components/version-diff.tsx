import type { IndexSnapshot, VersionDiff } from "@/src/types/models"

type VersionDiffProps = {
  base: IndexSnapshot | null
  target: IndexSnapshot | null
  diff: VersionDiff | null
}

function renderList(title: string, items: string[], color: string) {
  return (
    <div className="rounded-lg border bg-white p-3 text-xs shadow-sm">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {items.length === 0 ? (
        <div className="text-muted-foreground">无</div>
      ) : (
        <div className={`space-y-1 ${color}`}>
          {items.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export function VersionDiff({ base, target, diff }: VersionDiffProps) {
  if (!base || !target || !diff) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed bg-white text-sm text-muted-foreground">
        选择版本查看差异
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid gap-3 rounded-xl border bg-white p-4 text-xs shadow-sm lg:grid-cols-3">
        <div>
          <div className="text-[11px] text-slate-500">基准版本</div>
          <div className="text-sm font-semibold">v{base.version}</div>
          <div className="text-[11px] text-slate-500">{base.name ?? "未命名"}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">对比版本</div>
          <div className="text-sm font-semibold">v{target.version}</div>
          <div className="text-[11px] text-slate-500">{target.name ?? "未命名"}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">字数变化</div>
          <div className="text-sm font-semibold text-slate-900">
            +{diff.words_added} / -{diff.words_removed}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {renderList("新增节点", diff.nodes_added, "text-emerald-700")}
        {renderList("删除节点", diff.nodes_deleted, "text-red-700")}
        {renderList("修改节点", diff.nodes_modified, "text-amber-700")}
        {renderList("新增实体", diff.entities_added, "text-emerald-700")}
        {renderList("删除实体", diff.entities_deleted, "text-red-700")}
        {renderList("新增关系", diff.relations_added, "text-emerald-700")}
        {renderList("删除关系", diff.relations_deleted, "text-red-700")}
      </div>
    </div>
  )
}
