'use client'

import { BiliAccount } from '@/lib/types'
import { deleteAccount } from '@/app/actions'
import { Trash2, Edit, Key, User, CreditCard, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { AccountForm } from './AccountForm'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"

export function AccountCard({ account }: { account: BiliAccount }) {
  const [isEditing, setIsEditing] = useState(false)

  const handleDelete = async () => {
    if (confirm('确定要删除此账号吗？')) {
      try {
        await deleteAccount(account.dede_user_id)
        toast.success("账号已删除")
      } catch (e) {
        toast.error("删除账号失败")
      }
    }
  }

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
             <User className="h-4 w-4 text-muted-foreground" />
             {account.username}
          </CardTitle>
          <CardDescription className="font-mono text-xs truncate max-w-[180px] flex items-center gap-1" title={account.dede_user_id}>
            <span>ID: </span>
            <a 
              href={`https://space.bilibili.com/${account.dede_user_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              {account.dede_user_id}
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </div>
        <div className="flex gap-1">
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Edit className="h-4 w-4" />
                <span className="sr-only">编辑</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>编辑账号</DialogTitle>
                <DialogDescription>
                  更新账号信息或替换 Cookies
                </DialogDescription>
              </DialogHeader>
              <AccountForm 
                account={account} 
                onCancel={() => setIsEditing(false)} 
                onSuccess={() => setIsEditing(false)} 
              />
            </DialogContent>
          </Dialog>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">删除</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Key className="h-3 w-3" />
          <span className="font-mono text-xs">
            {account.server_chan_key ? '••••' + account.server_chan_key.slice(-4) : '未配置'}
          </span>
        </div>
        <div className="flex items-center gap-2">
           <CreditCard className="h-3 w-3 text-muted-foreground" />
           <Badge variant="secondary" className="font-mono text-xs font-normal">
             JCT: {account.bili_jct.slice(0, 6)}...
           </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
