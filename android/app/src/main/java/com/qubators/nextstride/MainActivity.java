package com.qubators.nextstride;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.ArrayList;
import java.util.List;

/**
 * Minimal wrapper: full-screen WebView over the deployed NextStride site.
 * All product logic, auth, AI, and data live server-side; nothing is cached
 * for offline use and no secrets are bundled. Back navigates WebView history.
 */
public class MainActivity extends Activity {

    private static final int MIC_REQUEST_CODE = 41;

    private WebView webView;
    private PermissionRequest pendingAudioRequest;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Grant microphone capture to the site (voice input); deny
                // anything else without touching request bodies.
                runOnUiThread(() -> {
                    List<String> granted = new ArrayList<>();
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            granted.add(resource);
                        }
                    }
                    if (granted.isEmpty()) {
                        request.deny();
                        return;
                    }
                    if (hasMicPermission()) {
                        request.grant(granted.toArray(new String[0]));
                    } else {
                        pendingAudioRequest = request;
                        requestPermissions(
                                new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST_CODE);
                    }
                });
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(getString(R.string.website_url));
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean hasMicPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MIC_REQUEST_CODE && pendingAudioRequest != null) {
            PermissionRequest request = pendingAudioRequest;
            pendingAudioRequest = null;
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                List<String> granted = new ArrayList<>();
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        granted.add(resource);
                    }
                }
                request.grant(granted.toArray(new String[0]));
            } else {
                request.deny();
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
