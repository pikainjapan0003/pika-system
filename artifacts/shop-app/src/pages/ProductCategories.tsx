import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMyStore,
  useListProductCategories,
  useCreateProductCategory,
  useUpdateProductCategory,
  useDeleteProductCategory,
  getListProductCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ProductCategoriesPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: store } = useGetMyStore();
  const storeId = store?.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: categories, isLoading, isError } = useListProductCategories(storeId ?? 0, { query: { enabled: !!storeId } as any });
  const createCategory = useCreateProductCategory();
  const updateCategory = useUpdateProductCategory();
  const deleteCategory = useDeleteProductCategory();

  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListProductCategoriesQueryKey(storeId!) });

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { setCreateError("請輸入分類名稱"); return; }
    setIsCreating(true);
    setCreateError("");
    try {
      await createCategory.mutateAsync({ storeId: storeId!, data: { name } });
      setNewName("");
      await invalidate();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error ?? err?.message ?? "新增失敗，請稍後再試");
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (id: number, name: string) => {
    setEditingId(id);
    setEditingName(name);
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditError("");
  };

  const handleSaveEdit = async (categoryId: number) => {
    const name = editingName.trim();
    if (!name) { setEditError("分類名稱不可空白"); return; }
    setIsSavingEdit(true);
    setEditError("");
    try {
      await updateCategory.mutateAsync({ storeId: storeId!, categoryId, data: { name } });
      cancelEdit();
      await invalidate();
    } catch (err: any) {
      setEditError(err?.response?.data?.error ?? err?.message ?? "儲存失敗，請稍後再試");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (categoryId: number, name: string) => {
    if (!confirm(`確定刪除「${name}」？\n\n刪除分類不會刪除商品，商品會變成未分類。`)) return;
    try {
      await deleteCategory.mutateAsync({ storeId: storeId!, categoryId });
      await invalidate();
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err?.message ?? "刪除失敗，請稍後再試");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background max-w-[480px] mx-auto pb-16">

      {/* Header */}
      <header className="bg-white border-b border-border px-5 pt-10 pb-4 sticky top-0 z-10 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setLocation("/products")}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
          aria-label="返回商品"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">商品分類</h1>
          <p className="text-xs text-muted-foreground mt-0.5">新增後可在商品表單的主分類欄位選擇</p>
        </div>
      </header>

      <div className="px-5 py-5 space-y-4">

        {/* 新增分類 */}
        <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">新增分類</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setCreateError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              placeholder="分類名稱，如：冷凍食品"
              maxLength={80}
              className="flex-1 h-11 px-4 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isCreating || !storeId}
              className="h-11 px-4 bg-primary text-white text-sm font-semibold rounded-xl disabled:opacity-50 flex-shrink-0"
            >
              {isCreating ? "新增中…" : "新增"}
            </button>
          </div>
          {createError && (
            <p className="text-xs text-destructive">{createError}</p>
          )}
        </div>

        {/* 分類列表 */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">
              分類列表
              {categories && categories.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {categories.length} 個
                </span>
              )}
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-destructive">載入分類失敗，請稍後再試</p>
            </div>
          ) : !categories || categories.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">尚未建立分類</p>
              <p className="text-xs text-muted-foreground mt-1">新增第一個分類，讓商品更好管理</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {categories.map((cat) => (
                <li key={cat.id} className="px-4 py-3">
                  {editingId === cat.id ? (
                    /* 編輯模式 */
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => { setEditingName(e.target.value); setEditError(""); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveEdit(cat.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        maxLength={80}
                        autoFocus
                        className="w-full h-10 px-3 rounded-xl border border-primary bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {editError && <p className="text-xs text-destructive">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(cat.id)}
                          disabled={isSavingEdit}
                          className="h-9 px-4 bg-primary text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                        >
                          {isSavingEdit ? "儲存中…" : "儲存"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="h-9 px-4 bg-secondary text-foreground text-xs font-medium rounded-lg"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 顯示模式 */
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-foreground min-w-0 truncate">
                        {cat.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(cat.id, cat.name)}
                        className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary transition-colors flex-shrink-0"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(cat.id, cat.name)}
                        className="h-8 px-3 text-xs text-destructive hover:bg-destructive/5 border border-destructive/30 rounded-lg transition-colors flex-shrink-0"
                      >
                        刪除
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center px-2">
          刪除分類不會刪除商品，商品分類欄位會變成未設定
        </p>
      </div>
    </div>
  );
}
