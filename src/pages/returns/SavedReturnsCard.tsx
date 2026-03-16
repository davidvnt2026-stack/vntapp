import { Calendar, Link as LinkIcon } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

interface SavedReturnsCardProps {
  showSavedReturns: boolean;
  onToggleShowSavedReturns: () => void;
}

export function SavedReturnsCard({
  showSavedReturns,
  onToggleShowSavedReturns,
}: SavedReturnsCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Saved Returns by Date
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <LinkIcon className="h-3.5 w-3.5" />
            Map SKUs
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={onToggleShowSavedReturns}
          >
            {showSavedReturns ? "Hide" : "Show"} Saved Returns
          </Button>
        </div>
      </div>
    </Card>
  );
}
