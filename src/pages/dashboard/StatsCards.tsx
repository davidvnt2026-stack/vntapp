import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import {
  ShoppingCart,
  TrendingUp,
  Clock,
  Package,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatCurrency } from "../../lib/utils";

type StatsData = {
  today: { count: number; revenue: number; currency?: string };
  thisWeek: { count: number; revenue: number; currency?: string };
  thisMonth: { count: number; revenue: number; currency?: string };
  pending: { count: number; revenue: number; currency?: string };
};

interface StatsCardsProps {
  stats: StatsData;
}

const cardsConfig = (stats: StatsData) => [
  {
    title: "Today's Orders",
    value: stats.today.count,
    revenue: stats.today.revenue,
    currency: stats.today.currency || "RON",
    icon: ShoppingCart,
    trend: stats.today.count > 0 ? "up" : "neutral",
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/50",
  },
  {
    title: "This Week",
    value: stats.thisWeek.count,
    revenue: stats.thisWeek.revenue,
    currency: stats.thisWeek.currency || "RON",
    icon: TrendingUp,
    trend: "up",
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/50",
  },
  {
    title: "This Month",
    value: stats.thisMonth.count,
    revenue: stats.thisMonth.revenue,
    currency: stats.thisMonth.currency || "RON",
    icon: Package,
    trend: "up",
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/50",
  },
  {
    title: "Pending Orders",
    value: stats.pending.count,
    revenue: stats.pending.revenue,
    currency: stats.pending.currency || "RON",
    icon: Clock,
    trend: stats.pending.count > 10 ? "down" : "neutral",
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900/50",
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = cardsConfig(stats);
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{card.value}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                {formatCurrency(card.revenue, card.currency)}
              </span>
              {card.trend === "up" && (
                <ArrowUpRight className="h-4 w-4 text-green-600" />
              )}
              {card.trend === "down" && (
                <ArrowDownRight className="h-4 w-4 text-red-600" />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
