package vn.pikepike.app;

import static org.junit.Assert.*;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against the Docker API: exercises bundled UI, native HTTP, cookie session and reload. */
@RunWith(AndroidJUnit4.class)
public class NativeLoginTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(expression, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView evaluation timed out", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitUntil(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 60_000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(evaluate(scenario, expression))) return;
            Thread.sleep(250);
        }
        fail("WebView condition failed: " + expression + "\n" + evaluate(scenario, "document.body.innerText.slice(0,1500)"));
    }

    @Test
    public void bundledClientLogsInPersistsAcrossReloadAndLogsOut() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitUntil(scenario, "!!document.querySelector('input[autocomplete=username]')");
            assertEquals("true", evaluate(scenario, "location.hostname === 'localhost'"));
            assertEquals("true", evaluate(scenario, "window.CapacitorHttpAndroidInterface.isEnabled()"));
            evaluate(scenario, "(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; for (const [selector,value] of [['input[autocomplete=username]','student@pikepike.vn'],['input[type=password]','PikePike2026!']]) { const input=document.querySelector(selector); set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); } return true; })()");
            waitUntil(scenario, "!!document.querySelector('form button:not([disabled])')");
            evaluate(scenario, "document.querySelector('form').requestSubmit()");
            waitUntil(scenario, "location.search.includes('screen=home') && document.body.innerText.includes('Ga Metro')");
            // A reload is asynchronous: exclude the old DOM before checking the restored session.
            evaluate(scenario, "window.__nativeReloadProbe = true; location.reload()");
            waitUntil(scenario, "!window.__nativeReloadProbe && location.search.includes('screen=home') && document.body.innerText.includes('Ga Metro')");
            evaluate(scenario, "document.querySelector('[aria-label=\"Hồ sơ và cài đặt\"]').click()");
            waitUntil(scenario, "location.search.includes('screen=settings')");
            waitUntil(scenario, "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Đăng xuất')");
            evaluate(scenario, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Đăng xuất').click()");
            waitUntil(scenario, "location.search.includes('screen=login') && !!document.querySelector('input[autocomplete=username]')");
        }
    }
}
