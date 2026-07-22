'use client'

import { Loader2, XCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface OttPayCancelOrderButtonProps {
  cancelling: boolean
  disabled?: boolean
  className?: string
  onCancel: () => Promise<unknown>
}

export function OttPayCancelOrderButton({
  cancelling,
  disabled = false,
  className,
  onCancel,
}: OttPayCancelOrderButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" disabled={disabled || cancelling} className={cn('text-muted-foreground hover:text-destructive', className)}>
          {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
          {cancelling ? '正在取消…' : '取消订单'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>取消当前订单并重新选择？</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 leading-6">
            <span className="block">系统会先查询支付状态并关闭本站打开的支付窗口，然后解除当前订单占用，你可以立即选择其他商品。</span>
            <span className="block">OTT Pay 暂无主动关单接口。如果旧支付页仍在其他窗口或设备打开，请先关闭；若之后仍支付旧单，系统会照常发放对应权益，可能形成两笔购买。</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>继续保留</AlertDialogCancel>
          <AlertDialogAction
            disabled={cancelling}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void onCancel()}
          >
            确认取消
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
