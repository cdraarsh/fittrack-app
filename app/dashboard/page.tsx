import { redirect } from 'next/navigation';

/** v1 start URL — installed v1 PWAs still open here. */
export default function DashboardRedirect() {
  redirect('/today');
}
