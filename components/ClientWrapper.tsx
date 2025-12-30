'use client'

import { useState } from 'react'
import { BiliAccount } from '@/lib/types'
import { AccountCard } from './AccountCard'
import { AccountForm } from './AccountForm'
import { Plus } from 'lucide-react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export default function ClientWrapper({ accounts }: { accounts: BiliAccount[] | null }) {
  const [isAdding, setIsAdding] = useState(false)
  const accountList = accounts || []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold tracking-tight">账号列表 ({accountList.length})</h2>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> 添加账号
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加新账号</DialogTitle>
              <DialogDescription>
                上传您的 Bilibili cookies.txt 文件开始管理
              </DialogDescription>
            </DialogHeader>
            <AccountForm onCancel={() => setIsAdding(false)} onSuccess={() => setIsAdding(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accountList.length > 0 ? (
          accountList.map((account) => (
            <AccountCard key={account.dede_user_id} account={account} />
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-muted/20">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">暂无账号</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              上传您的 cookies.txt 文件，开始管理您的 Bilibili 账号
            </p>
            <Button onClick={() => setIsAdding(true)}>添加账号</Button>
          </div>
        )}
      </div>
    </div>
  )
}
