import os
import shutil
from PIL import Image, ImageDraw

def draw_speech_bubble_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer circle / background
    padding = int(size * 0.05)
    circle_box = [padding, padding, size - padding, size - padding]
    
    # Draw blue circular background
    draw.ellipse(circle_box, fill=(0, 132, 255, 255))
    
    # Draw white speech bubble inside
    b_left = int(size * 0.22)
    b_top = int(size * 0.25)
    b_right = int(size * 0.78)
    b_bottom = int(size * 0.65)
    radius = int(size * 0.12)
    
    draw.rounded_rectangle([b_left, b_top, b_right, b_bottom], radius=radius, fill=(255, 255, 255, 255))
    
    # Tail of speech bubble
    tail_points = [
        (int(size * 0.32), int(size * 0.62)),
        (int(size * 0.22), int(size * 0.78)),
        (int(size * 0.44), int(size * 0.64))
    ]
    draw.polygon(tail_points, fill=(255, 255, 255, 255))
    
    # Draw 3 small blue dots inside the white speech bubble
    dot_radius = int(size * 0.035)
    cy = int((b_top + b_bottom) / 2)
    cx1 = int(size * 0.38)
    cx2 = int(size * 0.50)
    cx3 = int(size * 0.62)
    
    draw.ellipse([cx1 - dot_radius, cy - dot_radius, cx1 + dot_radius, cy + dot_radius], fill=(0, 132, 255, 255))
    draw.ellipse([cx2 - dot_radius, cy - dot_radius, cx2 + dot_radius, cy + dot_radius], fill=(0, 132, 255, 255))
    draw.ellipse([cx3 - dot_radius, cy - dot_radius, cx3 + dot_radius, cy + dot_radius], fill=(0, 132, 255, 255))
    
    return img

if __name__ == '__main__':
    base_dir = r'c:\Users\karln\OneDrive\Desktop\MessengerApp'
    dirs = [
        os.path.join(base_dir, 'assets'),
        os.path.join(base_dir, 'public'),
        os.path.join(base_dir, 'dist'),
    ]
    
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        
        icon_512 = draw_speech_bubble_icon(512)
        icon_512.save(os.path.join(d, 'icon.png'))
        
        favicon_64 = draw_speech_bubble_icon(64)
        favicon_64.save(os.path.join(d, 'favicon.png'))
        
        favicon_64.save(os.path.join(d, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    print("Custom Messenger Favicons generated and synced across assets, public, and dist!")
