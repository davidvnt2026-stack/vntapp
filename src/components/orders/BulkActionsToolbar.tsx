import { useRef, useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Card, CardContent } from "../ui/Card";
import { Input } from "../ui/Input";
import { 
  X, 
  FileText, 
  Truck, 
  Receipt, 
  Ban, 
  CheckCircle2, 
  XCircle, 
  Printer,
  Loader2,
  MoreHorizontal,
  ClipboardList,
  Plus,
  Calendar,
  PenLine,
} from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

interface PickingList {
  _id: Id<"pickingLists">;
  name: string;
}

interface BulkActionsToolbarProps {
  selectedCount: number;
  onDeselect: () => void;
  onGenerateAwb: () => void;
  onGenerateInvoice: () => void;
  onGenerateBoth: () => void;
  onStornoAwb: () => void;
  onStornoInvoice: () => void;
  onSetWorked?: (isWorked: boolean) => void;
  onPrint: () => void;
  isProcessing: boolean;
  // Optional picking list props
  pickingLists?: PickingList[];
  onAddToPickingList?: (pickingListId: Id<"pickingLists">) => void;
  onAddToPickingListToday?: () => void;
  onCreateAndAddToPickingList?: (name: string) => void;
}

export function BulkActionsToolbar({
  selectedCount,
  onDeselect,
  onGenerateAwb,
  onGenerateInvoice,
  onGenerateBoth,
  onStornoAwb,
  onStornoInvoice,
  onSetWorked,
  onPrint,
  isProcessing,
  pickingLists,
  onAddToPickingList,
  onAddToPickingListToday,
  onCreateAndAddToPickingList,
}: BulkActionsToolbarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showPickingListMenu, setShowPickingListMenu] = useState(false);
  const [showCreateCustomInput, setShowCreateCustomInput] = useState(false);
  const [customListName, setCustomListName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const pickingListMenuRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
      if (pickingListMenuRef.current && !pickingListMenuRef.current.contains(e.target as Node)) {
        setShowPickingListMenu(false);
        setShowCreateCustomInput(false);
        setCustomListName("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (showCreateCustomInput && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [showCreateCustomInput]);

  if (selectedCount === 0) return null;

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary font-semibold">
              {selectedCount} selectate
            </Badge>
            <Button size="sm" variant="ghost" onClick={onDeselect}>
              <X className="h-4 w-4 mr-1" />
              Deselectează
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Add to Picking List */}
            {pickingLists && (onAddToPickingList || onAddToPickingListToday || onCreateAndAddToPickingList) && (
              <div className="relative" ref={pickingListMenuRef}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPickingListMenu(!showPickingListMenu)}
                  disabled={isProcessing}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Adaugă la Picking List
                </Button>
                
                {showPickingListMenu && (
                  <div className="absolute left-0 top-full mt-1 w-72 bg-card border border-border rounded-lg shadow-lg z-30">
                    {/* Today's Picking List */}
                    {onAddToPickingListToday && (
                      <button
                        onClick={() => {
                          onAddToPickingListToday();
                          setShowPickingListMenu(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2 border-b font-medium"
                        disabled={isProcessing}
                      >
                        <Calendar className="h-4 w-4 text-green-600" />
                        Picking List pentru azi
                      </button>
                    )}

                    {/* Create Custom Picking List */}
                    {onCreateAndAddToPickingList && (
                      <div className="border-b">
                        {!showCreateCustomInput ? (
                          <button
                            onClick={() => setShowCreateCustomInput(true)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2 font-medium"
                            disabled={isProcessing}
                          >
                            <PenLine className="h-4 w-4 text-purple-600" />
                            Creează Picking List nou
                          </button>
                        ) : (
                          <div className="p-2 space-y-2">
                            <Input
                              ref={customInputRef}
                              placeholder="Nume picking list..."
                              value={customListName}
                              onChange={(e) => setCustomListName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && customListName.trim()) {
                                  onCreateAndAddToPickingList(customListName.trim());
                                  setCustomListName("");
                                  setShowCreateCustomInput(false);
                                  setShowPickingListMenu(false);
                                }
                                if (e.key === "Escape") {
                                  setShowCreateCustomInput(false);
                                  setCustomListName("");
                                }
                              }}
                              className="h-8 text-sm"
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs flex-1"
                                onClick={() => {
                                  if (customListName.trim()) {
                                    onCreateAndAddToPickingList(customListName.trim());
                                    setCustomListName("");
                                    setShowCreateCustomInput(false);
                                    setShowPickingListMenu(false);
                                  }
                                }}
                                disabled={!customListName.trim() || isProcessing}
                              >
                                Creează & Adaugă
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setShowCreateCustomInput(false);
                                  setCustomListName("");
                                }}
                              >
                                Anulează
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Existing Picking Lists */}
                    {pickingLists.length > 0 && onAddToPickingList && (
                      <>
                        <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase">
                          Liste existente
                        </div>
                        {pickingLists.map((pl) => (
                          <button
                            key={pl._id}
                            onClick={() => { 
                              onAddToPickingList(pl._id); 
                              setShowPickingListMenu(false); 
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                            disabled={isProcessing}
                          >
                            <Plus className="h-4 w-4 text-blue-600" />
                            {pl.name}
                          </button>
                        ))}
                      </>
                    )}

                    {pickingLists.length === 0 && !onAddToPickingListToday && !onCreateAndAddToPickingList && (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        Nicio listă de picking.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Generate Documents Dropdown */}
            <div className="relative" ref={menuRef}>
              <Button
                size="sm"
                onClick={() => setShowMenu(!showMenu)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Generează Documente
                <MoreHorizontal className="h-4 w-4 ml-2" />
              </Button>
              
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-30">
                  <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase">
                    Generare
                  </div>
                  <button
                    onClick={() => { onGenerateAwb(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                    disabled={isProcessing}
                  >
                    <Truck className="h-4 w-4 text-blue-600" />
                    Generează AWB-uri
                  </button>
                  <button
                    onClick={() => { onGenerateInvoice(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                    disabled={isProcessing}
                  >
                    <Receipt className="h-4 w-4 text-green-600" />
                    Generează Facturi
                  </button>
                  <button
                    onClick={() => { onGenerateBoth(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 border-b"
                    disabled={isProcessing}
                  >
                    <FileText className="h-4 w-4 text-purple-600" />
                    Generează Ambele (AWB + Factură)
                  </button>
                  
                  <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase">
                    Stornare
                  </div>
                  <button
                    onClick={() => { onStornoAwb(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 text-red-600"
                    disabled={isProcessing}
                  >
                    <Ban className="h-4 w-4" />
                    Stornează AWB-uri
                  </button>
                  <button
                    onClick={() => { onStornoInvoice(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 text-red-600 border-b"
                    disabled={isProcessing}
                  >
                    <Ban className="h-4 w-4" />
                    Stornează Facturi
                  </button>
                  
                  {onSetWorked && (
                    <>
                      <div className="p-2 border-b text-xs font-medium text-muted-foreground uppercase">
                        Status Lucrat
                      </div>
                      <button
                        onClick={() => { onSetWorked(true); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                        disabled={isProcessing}
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Marchează ca Lucrate
                      </button>
                      <button
                        onClick={() => { onSetWorked(false); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                        disabled={isProcessing}
                      >
                        <XCircle className="h-4 w-4 text-gray-500" />
                        Demarchează
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Print Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={onPrint}
              disabled={isProcessing}
            >
              <Printer className="h-4 w-4 mr-2" />
              Printează
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
