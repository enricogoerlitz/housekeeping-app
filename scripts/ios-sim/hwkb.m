// Turn the simulator's hardware keyboard off (so the software keyboard shows) or on.
// Build: clang -fobjc-arc -framework Foundation scripts/ios-sim/hwkb.m -o tmp/ui-verify/hwkb
// Usage: tmp/ui-verify/hwkb <UDID> <0|1>   (do not commit the binary; tmp/ is git-ignored)
#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import <objc/message.h>
int main(int argc, const char *argv[]) {
  if (argc < 3) { fprintf(stderr, "usage: hwkb <UDID> <0|1>\n"); return 2; }
  @autoreleasepool {
    dlopen("/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator", RTLD_NOW);
    NSString *udid = [NSString stringWithUTF8String:argv[1]];
    BOOL on = atoi(argv[2]) != 0;
    Class SimServiceContext = NSClassFromString(@"SimServiceContext");
    NSError *err = nil;
    id ctx = ((id (*)(id, SEL, id, NSError **))objc_msgSend)(SimServiceContext, NSSelectorFromString(@"sharedServiceContextForDeveloperDir:error:"), @"/Applications/Xcode.app/Contents/Developer", &err);
    id set = ((id (*)(id, SEL, NSError **))objc_msgSend)(ctx, NSSelectorFromString(@"defaultDeviceSetWithError:"), &err);
    NSDictionary *devices = [set valueForKey:@"devicesByUDID"];
    id dev = devices[[[NSUUID alloc] initWithUUIDString:udid]];
    if (!dev) { NSLog(@"no device"); return 1; }
    BOOL ok = ((BOOL (*)(id, SEL, BOOL, unsigned int, NSError **))objc_msgSend)(dev, NSSelectorFromString(@"setHardwareKeyboardEnabled:keyboardType:error:"), on, 0, &err);
    NSLog(@"ok=%d err=%@", ok, err);
  }
  return 0;
}
