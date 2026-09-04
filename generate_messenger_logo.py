import os
from PIL import Image, ImageDraw

def draw_messenger_logo(size):
    # High resolution anti-aliased image
    scale = 4
    real_size = size * scale
    img = Image.new('RGBA', (real_size, real_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. Draw blue speech bubble container
    cx = real_size * 0.5
    cy = real_size * 0.45
    r = real_size * 0.42
    
    # Main bubble circle
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 132, 255, 255))
    
    # Bottom left tail
    tail_points = [
        (real_size * 0.32, real_size * 0.72),
        (real_size * 0.25, real_size * 0.88),
        (real_size * 0.48, real_size * 0.80)
    ]
    draw.polygon(tail_points, fill=(0, 132, 255, 255))
    
    # Darker blue shadow accent on bottom half (Messenger 2-tone gradient style)
    # 2. Draw White Lightning Bolt
    # Lightning bolt polygon points relative to scale
    lightning_points = [
        (real_size * 0.69, real_size * 0.33), # Top right point
        (real_size * 0.52, real_size * 0.54), # Inner right fold
        (real_size * 0.59, real_size * 0.54), # Middle right protrusion
        (real_size * 0.31, real_size * 0.67), # Bottom left tip
        (real_size * 0.48, real_size * 0.46), # Inner left fold
        (real_size * 0.41, real_size * 0.46), # Middle left protrusion
    ]
    draw.polygon(lightning_points, fill=(255, 255, 255, 255))
    
    # Downsample for crisp smooth anti-aliasing
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    return img

if __name__ == '__main__':
    assets_dir = r'c:\Users\karln\OneDrive\Desktop\MessengerApp\assets'
    public_dir = r'c:\Users\karln\OneDrive\Desktop\MessengerApp\public'
    dist_dir = r'c:\Users\karln\OneDrive\Desktop\MessengerApp\dist'
    
    os.makedirs(assets_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(dist_dir, exist_ok=True)
    
    icon_512 = draw_messenger_logo(512)
    icon_512.save(os.path.join(assets_dir, 'icon.png'))
    icon_512.save(os.path.join(public_dir, 'icon.png'))
    icon_512.save(os.path.join(dist_dir, 'icon.png'))
    
    favicon_64 = draw_messenger_logo(64)
    favicon_64.save(os.path.join(assets_dir, 'favicon.png'))
    favicon_64.save(os.path.join(public_dir, 'favicon.png'))
    favicon_64.save(os.path.join(dist_dir, 'favicon.png'))
    
    favicon_64.save(os.path.join(assets_dir, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    favicon_64.save(os.path.join(public_dir, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    favicon_64.save(os.path.join(dist_dir, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    
    print("Messenger Lightning Bolt icons generated across assets, public, and dist!")
