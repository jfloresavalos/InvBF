package com.inventario.lectora;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HoneywellScanner")
public class HoneywellScannerPlugin extends Plugin {

    private static final String TAG = "HoneywellScanner";
    private static final String ACTION_DECODE_DATA = "android.intent.ACTION_DECODE_DATA";

    private boolean isListening = false;
    private BroadcastReceiver mScanReceiver;

    @Override
    public void load() {
        Log.d(TAG, "HoneywellScannerPlugin loading...");
        registerScanReceiver();
    }

    private void registerScanReceiver() {
        mScanReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Log.d(TAG, "Received intent: " + intent.getAction());

                String barcode = intent.getStringExtra("barcode_string");
                String data = intent.getStringExtra("data");

                String result = (barcode != null) ? barcode.trim() :
                                (data != null) ? data.trim() : null;

                if (result != null && !result.isEmpty()) {
                    Log.d(TAG, "BARCODE: " + result);
                    JSObject jsData = new JSObject();
                    jsData.put("barcode", result);
                    notifyListeners("barcodeScanned", jsData);
                } else {
                    Log.w(TAG, "Intent received but no barcode data");
                    // Debug: log all extras
                    Bundle extras = intent.getExtras();
                    if (extras != null) {
                        for (String key : extras.keySet()) {
                            Log.d(TAG, "Extra: " + key + " = " + extras.get(key));
                        }
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_DECODE_DATA);

        try {
            getActivity().registerReceiver(mScanReceiver, filter);
            isListening = true;
            Log.d(TAG, "Registered for: " + ACTION_DECODE_DATA);

            JSObject status = new JSObject();
            status.put("status", "ready");
            status.put("message", "Scanner Honeywell listo");
            notifyListeners("scannerReady", status);
        } catch (Exception e) {
            Log.e(TAG, "Error registering receiver: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (!isListening) {
            registerScanReceiver();
        }
        JSObject result = new JSObject();
        result.put("status", isListening ? "listening" : "error");
        call.resolve(result);
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        unregisterReceiver();
        call.resolve(new JSObject().put("status", "stopped"));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("initialized", isListening);
        result.put("method", "broadcast_receiver");
        result.put("action", ACTION_DECODE_DATA);
        call.resolve(result);
    }

    private void unregisterReceiver() {
        try {
            if (mScanReceiver != null && isListening) {
                getActivity().unregisterReceiver(mScanReceiver);
                isListening = false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error unregistering: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        unregisterReceiver();
    }
}
