import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface WalletButtonProps {
    onConnect?: (publicKey: string) => void;
}

export default function WalletButton({ onConnect }: WalletButtonProps) {
    const { publicKey, connected } = useWallet();

    React.useEffect(() => {
        if (connected && publicKey && onConnect) {
            onConnect(publicKey.toString());
        }
    }, [connected, publicKey, onConnect]);

    return (
        <div className="wallet-button-container">
            <WalletMultiButton 
                style={{
                    backgroundColor: '#1e7cfa',
                    borderRadius: '8px',
                    height: '56px',
                    fontSize: '18px',
                    fontWeight: '500',
                    width: '100%',
                    border: 'none',
                    color: 'black',
                    transition: 'background-color 0.2s ease',
                }}
            />
            <style>{`
                .wallet-button-container .wallet-adapter-button {
                    background-color: #1e7cfa !important;
                    border-radius: 8px !important;
                    height: 56px !important;
                    font-size: 18px !important;
                    font-weight: 500 !important;
                    width: 100% !important;
                    border: none !important;
                    color: black !important;
                    transition: background-color 0.2s ease !important;
                }
                .wallet-button-container .wallet-adapter-button:hover {
                    background-color: #1a6ce8 !important;
                }
                .wallet-button-container .wallet-adapter-button:not([disabled]):hover {
                    background-color: #1a6ce8 !important;
                }
            `}</style>
        </div>
    );
}