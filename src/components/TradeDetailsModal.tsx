import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Clock, Wallet, Info } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { fetchSOLPrice, formatPrice } from '../services/birdeyeApi';
import type { TradingPosition } from '../services/positionService';

interface TradeDetailsModalProps {
  positionId: number;
  onClose: () => void;
}

type TradeResults = {
  tokenSymbol: string;
  direction: 'Long' | 'Short';
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  collateralAmount: number;
  grossPnL: number;
  platformFee: number; // USD
  finalPnL: number; // USD
  pnlPercentage: number;
  totalReturn: number; // SOL
} | null;

export default function TradeDetailsModal({ positionId, onClose }: TradeDetailsModalProps) {
  const [position, setPosition] = useState<TradingPosition | null>(null);
  const [tradeResults, setTradeResults] = useState<TradeResults>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [{ data, error: err }, price] = await Promise.all([
          supabase.from('trading_positions').select('*').eq('id', positionId).single(),
          fetchSOLPrice().catch(() => null)
        ]);

        if (err) throw err;
        if (!data) throw new Error('Trade not found');

        if (!mounted) return;
        setPosition(data as TradingPosition);
        setSolPrice(typeof price === 'number' ? price : null);

        const tr = (data as TradingPosition).trade_results ? JSON.parse((data as TradingPosition).trade_results as any) as TradeResults : null;
        setTradeResults(tr);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load trade details');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [positionId]);

  const durationLabel = useMemo(() => {
    if (!position?.created_at || !position?.closed_at) return '-';
    const start = new Date(position.created_at).getTime();
    const end = new Date(position.closed_at).getTime();
    const ms = Math.max(0, end - start);
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remMins}m`;
    return `${remMins}m`;
  }, [position?.created_at, position?.closed_at]);

  const approxCollateralUSD = useMemo(() => {
    if (!position || !solPrice) return null;
    return Number(position.collateral_sol) * solPrice;
  }, [position, solPrice]);

  const pnlColor = (value?: number | null) =>
    typeof value === 'number' ? (value >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-400';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 text-white flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-black border border-gray-800 rounded-lg sm:rounded-xl w-full max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-800 flex items-center justify-center text-lg font-bold">
                {position?.token_symbol ? position.token_symbol[0] : '?'}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg sm:text-xl font-bold">{position?.token_symbol || '—'}</h2>
                  {position && (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${position.status === 'liquidated' ? 'bg-red-600/30 text-red-300' : 'bg-gray-700 text-gray-200'}`}>
                      {position.status}
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-xs sm:text-sm">Position #{position?.id ?? positionId}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          {isLoading && (
            <p className="text-gray-400">Loading trade details…</p>
          )}
          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 mb-4 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-300 mt-0.5" />
              <span className="text-red-200 text-sm">{error}</span>
            </div>
          )}

          {position && (
            <div className="space-y-3 sm:space-y-4">
              {/* Basic */}
              <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 font-semibold">{position.direction}</span>
                  <span className="px-2 py-0.5 rounded bg-purple-600/20 text-purple-300 font-semibold">{position.leverage}x</span>
                  <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-200 font-semibold">{position.order_type}</span>
                </div>
              </div>

              {/* Entry */}
              <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 sm:p-4">
                <h3 className="font-semibold mb-2 sm:mb-3">Entry</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500">Entry time</div>
                    <div>{position.created_at ? new Date(position.created_at).toLocaleString() : '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Entry price (USD)</div>
                    <div>{formatPrice(Number(position.entry_price))}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Amount (base)</div>
                    <div>{Number(position.amount).toFixed(6)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Position value (USD)</div>
                    <div>${Number(position.position_value_usd).toFixed(2)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-gray-500 flex items-center space-x-1">
                      <Wallet className="w-3 h-3" />
                      <span>Collateral locked</span>
                      {solPrice && <span className="text-gray-500">(≈ USD)</span>}
                    </div>
                    <div>
                      {Number(position.collateral_sol).toFixed(4)} SOL
                      {approxCollateralUSD !== null && (
                        <span className="text-gray-400 ml-2">≈ ${approxCollateralUSD.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Liquidation price</div>
                    <div>{formatPrice(Number(position.liquidation_price))}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Margin-call price</div>
                    <div>{position.margin_call_price ? formatPrice(Number(position.margin_call_price)) : '—'}</div>
                  </div>
                </div>
              </div>

              {/* Exit */}
              {(position.status === 'closed' || position.status === 'liquidated') && (
                <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 sm:p-4">
                  <h3 className="font-semibold mb-2 sm:mb-3">Exit</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-gray-500 flex items-center space-x-1"><Clock className="w-3 h-3" /><span>Close time</span></div>
                      <div>{position.closed_at ? new Date(position.closed_at).toLocaleString() : '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Close price (USD)</div>
                      <div>{position.close_price ? formatPrice(Number(position.close_price)) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Duration</div>
                      <div>{durationLabel}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Close reason</div>
                      <div className="capitalize">{position.close_reason || '—'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Results */}
              {tradeResults && (
                <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 sm:p-4">
                  <h3 className="font-semibold mb-2 sm:mb-3">Results</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-gray-500">Gross PnL (USD)</div>
                      <div className={pnlColor(tradeResults.grossPnL)}>
                        {tradeResults.grossPnL >= 0 ? '+' : '-'}${Math.abs(tradeResults.grossPnL).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Final PnL after fee (USD)</div>
                      <div className={pnlColor(tradeResults.finalPnL)}>
                        {tradeResults.finalPnL >= 0 ? '+' : '-'}${Math.abs(tradeResults.finalPnL).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">PnL %</div>
                      <div className={pnlColor(tradeResults.pnlPercentage)}>
                        {tradeResults.pnlPercentage.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Total return (SOL)</div>
                      <div>{tradeResults.totalReturn.toFixed(6)} SOL</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-500 flex items-start space-x-2">
                    <Info className="w-3 h-3 mt-0.5" />
                    <span>Platform fee is applied on total return for non-liquidations. Values above are recorded at close.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



