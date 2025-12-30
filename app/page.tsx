import { getAccounts } from './actions'
import ClientWrapper from '@/components/ClientWrapper'

export default async function Home() {
  const accounts = await getAccounts()

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col space-y-2 pb-6 border-b">
          <h1 className="text-3xl font-bold tracking-tight">Bili Manager</h1>
          <p className="text-muted-foreground">
            安全管理您的 Bilibili 账号与配置
          </p>
        </header>
        
        <ClientWrapper accounts={accounts} />
      </div>
    </main>
  )
}
